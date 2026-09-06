import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { getGitHubToken } from '@/lib/github-token';
import { GitHubClient } from '@/lib/github-client';
import { parseCreateTables, detectSqlWarnings, splitSqlStatements } from '@/lib/sql-splitter';
import logger from '@/lib/logger';

export async function POST(request: NextRequest) {
    const userId = await getCurrentUserId();
    if (!userId) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const token = await getGitHubToken(userId);
    if (!token) {
        return NextResponse.json({
            success: false,
            connected: false,
            error: 'GitHub account is not connected.'
        }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { repoFullName, branch = 'main', modulePath = 'fluxbase' } = body;

        if (!repoFullName || !repoFullName.includes('/')) {
            return NextResponse.json({
                success: false,
                error: 'Invalid repoFullName. Expected format: owner/repo'
            }, { status: 400 });
        }

        const [owner, repo] = repoFullName.split('/');
        const client = new GitHubClient(token);

        const fluxModule = await client.discoverFluxbaseModule(owner, repo, branch, modulePath);

        if (!fluxModule.found || fluxModule.files.length === 0) {
            return NextResponse.json({
                success: true,
                module: fluxModule,
                preview: {
                    tablesToCreate: [],
                    tableNames: [],
                    estimatedStatements: 0,
                    warnings: []
                }
            });
        }

        // Fetch first several files or contents for table dry-run preview & warnings
        let combinedSql = '';
        for (const file of fluxModule.files) {
            try {
                // Fetch up to 100KB per file for preview analysis
                const { content } = await client.getFileContent(owner, repo, file.path, branch);
                combinedSql += '\n' + content;
            } catch (fileErr) {
                logger.warn(`[GitHub Discover] Failed to read ${file.path} for preview:`, fileErr);
            }
        }

        const tablesToCreate = parseCreateTables(combinedSql);
        const statements = splitSqlStatements(combinedSql);
        const warnings = detectSqlWarnings(combinedSql);

        return NextResponse.json({
            success: true,
            module: fluxModule,
            preview: {
                tablesToCreate,
                tableNames: tablesToCreate.map(t => t.tableName),
                estimatedStatements: statements.length,
                warnings
            }
        });

    } catch (err: any) {
        logger.error('[GitHub Discover API] Error:', err);
        return NextResponse.json({
            success: false,
            error: err.message || 'Failed to scan repository module'
        }, { status: 500 });
    }
}
