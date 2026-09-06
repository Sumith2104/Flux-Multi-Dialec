import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { getGitHubToken, ensureGitHubTables } from '@/lib/github-token';
import { GitHubClient } from '@/lib/github-client';
import { splitSqlStatements, parseCreateTables } from '@/lib/sql-splitter';
import { getPgPool } from '@/lib/pg';
import logger from '@/lib/logger';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
    const userId = await getCurrentUserId();
    if (!userId) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const token = await getGitHubToken(userId);
    if (!token) {
        return NextResponse.json({
            success: false,
            error: 'GitHub account is not connected.'
        }, { status: 401 });
    }

    await ensureGitHubTables();

    try {
        const body = await request.json();
        const { projectId, force = false } = body;

        if (!projectId) {
            return NextResponse.json({ success: false, error: 'Project ID is required' }, { status: 400 });
        }

        const pool = getPgPool();
        const projectRes = await pool.query(`
            SELECT project_id, user_id, display_name, dialect, schema_name, 
                   github_repo, github_branch, github_module_path 
            FROM fluxbase_global.projects 
            WHERE project_id = $1 AND user_id = $2
        `, [projectId, userId]);

        if (projectRes.rows.length === 0) {
            return NextResponse.json({ success: false, error: 'Project not found or unauthorized' }, { status: 404 });
        }

        const project = projectRes.rows[0];
        const repoFullName = project.github_repo;
        const branch = project.github_branch || 'main';
        const modulePath = project.github_module_path || 'fluxbase';
        const dialect = project.dialect || 'postgresql';
        const schemaName = project.schema_name || `flux_tenant_${project.project_id}`;

        if (!repoFullName || !repoFullName.includes('/')) {
            return NextResponse.json({
                success: false,
                error: 'This project is not linked to a GitHub repository'
            }, { status: 400 });
        }

        const [owner, repo] = repoFullName.split('/');
        const client = new GitHubClient(token);

        // Fetch latest fluxbase module from GitHub
        const fluxModule = await client.discoverFluxbaseModule(owner, repo, branch, modulePath);
        if (!fluxModule.found || fluxModule.files.length === 0) {
            return NextResponse.json({
                success: false,
                error: `No .sql files found in ${repoFullName}@${branch} under ${modulePath}`
            }, { status: 404 });
        }

        // Get past import logs to compare file SHAs
        const logsRes = await pool.query(`
            SELECT DISTINCT ON (file_name) file_name, file_sha, status
            FROM fluxbase_global.import_logs
            WHERE project_id = $1
            ORDER BY file_name, executed_at DESC
        `, [projectId]);

        const lastShaMap = new Map<string, string>();
        logsRes.rows.forEach(r => {
            if (r.file_sha) lastShaMap.set(r.file_name, r.file_sha);
        });

        const newFiles: typeof fluxModule.files = [];
        const changedFiles: typeof fluxModule.files = [];
        let filesSkipped = 0;

        for (const file of fluxModule.files) {
            const previousSha = lastShaMap.get(file.name);
            if (!previousSha) {
                newFiles.push(file);
            } else if (previousSha !== file.sha) {
                changedFiles.push(file);
            } else {
                filesSkipped++;
            }
        }

        // If files changed and force is not provided, return a warning preview
        if (changedFiles.length > 0 && !force) {
            return NextResponse.json({
                success: false,
                requiresConfirmation: true,
                warning: `${changedFiles.length} file(s) have been modified in the repository. Re-executing altered files may modify existing tables. Confirm with force=true to proceed.`,
                changedFiles: changedFiles.map(f => f.name),
                newFiles: newFiles.map(f => f.name),
                filesSkipped
            }, { status: 200 });
        }

        const filesToExecute = [...newFiles, ...(force ? changedFiles : [])];

        if (filesToExecute.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'All SQL files are up to date. Nothing to sync.',
                syncResults: {
                    filesChecked: fluxModule.files.length,
                    filesChanged: 0,
                    filesNew: 0,
                    filesSkipped,
                    statementsExecuted: 0,
                    errors: []
                }
            });
        }

        let statementsExecuted = 0;
        const errors: Array<{ file: string; error: string }> = [];

        if (dialect === 'postgresql') {
            const pgClient = await pool.connect();
            try {
                await pgClient.query(`SET search_path TO "${schemaName}", public;`);

                for (const file of filesToExecute) {
                    const fileStartTime = Date.now();
                    try {
                        const { content, sha } = await client.getFileContent(owner, repo, file.path, branch);
                        const statements = splitSqlStatements(content);

                        let fileStmts = 0;
                        for (const stmt of statements) {
                            try {
                                await pgClient.query(stmt);
                                fileStmts++;
                                statementsExecuted++;
                            } catch (sErr: any) {
                                errors.push({ file: file.name, error: sErr.message });
                            }
                        }

                        const status = errors.some(e => e.file === file.name) ? 'error' : 'success';
                        await pool.query(`
                            INSERT INTO fluxbase_global.import_logs (
                                project_id, user_id, repo_full_name, branch, module_path,
                                file_name, file_sha, status, statements_executed, error_message, execution_time_ms
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        `, [
                            projectId, userId, repoFullName, branch, modulePath,
                            file.name, sha, status, fileStmts,
                            errors.find(e => e.file === file.name)?.error || null,
                            Date.now() - fileStartTime
                        ]);

                    } catch (fErr: any) {
                        errors.push({ file: file.name, error: fErr.message });
                    }
                }
            } finally {
                pgClient.release();
            }
        } else {
            const { getMysqlPool } = await import('@/lib/mysql');
            const mysqlPool = getMysqlPool();
            const conn = await mysqlPool.getConnection();

            try {
                await conn.query(`USE \`${schemaName}\`;`);

                for (const file of filesToExecute) {
                    const fileStartTime = Date.now();
                    try {
                        const { content, sha } = await client.getFileContent(owner, repo, file.path, branch);
                        const statements = splitSqlStatements(content);

                        let fileStmts = 0;
                        for (const stmt of statements) {
                            try {
                                await conn.query(stmt as any);
                                fileStmts++;
                                statementsExecuted++;
                            } catch (sErr: any) {
                                errors.push({ file: file.name, error: sErr.message });
                            }
                        }

                        const status = errors.some(e => e.file === file.name) ? 'error' : 'success';
                        await pool.query(`
                            INSERT INTO fluxbase_global.import_logs (
                                project_id, user_id, repo_full_name, branch, module_path,
                                file_name, file_sha, status, statements_executed, error_message, execution_time_ms
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        `, [
                            projectId, userId, repoFullName, branch, modulePath,
                            file.name, sha, status, fileStmts,
                            errors.find(e => e.file === file.name)?.error || null,
                            Date.now() - fileStartTime
                        ]);

                    } catch (fErr: any) {
                        errors.push({ file: file.name, error: fErr.message });
                    }
                }
            } finally {
                conn.release();
            }
        }

        // Update last_synced_at
        await pool.query(`
            UPDATE fluxbase_global.projects SET last_synced_at = NOW() WHERE project_id = $1
        `, [projectId]);

        try {
            const { invalidateProjectCache } = await import('@/lib/data');
            await invalidateProjectCache(projectId);
        } catch (cacheErr) {
            logger.warn('[GitHub Sync API] Cache invalidation warning:', cacheErr);
        }

        return NextResponse.json({
            success: true,
            syncResults: {
                filesChecked: fluxModule.files.length,
                filesChanged: changedFiles.length,
                filesNew: newFiles.length,
                filesSkipped,
                statementsExecuted,
                errors
            }
        });

    } catch (err: any) {
        logger.error('[GitHub Sync API] Error:', err);
        return NextResponse.json({
            success: false,
            error: err.message || 'Failed to sync with repository'
        }, { status: 500 });
    }
}
