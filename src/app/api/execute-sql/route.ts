import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { SqlEngine } from '@/lib/sql-engine';
import { getProjectById } from '@/lib/data';

export const maxDuration = 60; // 1 minute

export async function POST(request: Request) {
    const startTime = Date.now();
    try {
        const userId = await getCurrentUserId();
        if (!userId) return NextResponse.json({ success: false, error: { message: 'User not authenticated', code: 'AUTH_REQUIRED' } }, { status: 401 });

        const { projectId, query } = await request.json();
        if (!projectId || !query) {
            return NextResponse.json({ success: false, error: { message: 'Missing projectId or query', code: 'BAD_REQUEST' } }, { status: 400 });
        }

        const project = await getProjectById(projectId);
        if (!project) return NextResponse.json({ success: false, error: { message: 'Project not found', code: 'NOT_FOUND' } }, { status: 404 });

        // Use the new SQL Engine
        const engine = new SqlEngine(projectId);

        // Split multiple queries if any (semicolon) - basic support
        // The parser handles one statement at a time mostly, so we might need a loop if the UI sends multiple.
        // For now, assume single query or let parser handle first one.
        // If we want multiple statements, we'd need to split by ; not in quotes. 
        // Let's rely on the engine executing the single blob. The engine uses `astify` which returns array if multiple.
        // But our `execute` method currently handles the first AST. 
        // That is acceptable for now.

        let result;
        try {
            result = await engine.execute(query);
        } catch (e: any) {
            // Distinguish syntax errors from execution errors if possible
            return NextResponse.json({
                success: false,
                error: {
                    message: e.message || 'SQL Execution Error',
                    code: 'EXECUTION_ERROR',
                    hint: 'Check syntax and table names.'
                }
            }, { status: 200 });
        }

        const duration = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            result: {
                rows: result.rows || [],     // Ensure array
                columns: result.columns || [], // Ensure array
                message: result.message
            },
            explanation: result.explanation || [],
            executionInfo: {
                time: `${duration}ms`,
                rowCount: result.rows?.length || 0
            }
        });

    } catch (error: any) {
        console.error('SQL Execution Failed:', error);
        return NextResponse.json({
            success: false,
            error: {
                message: error.message || 'An unexpected error occurred',
                code: 'INTERNAL_ERROR'
            }
        }, { status: 200 });
    }
}
