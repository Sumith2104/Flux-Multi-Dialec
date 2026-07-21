import { NextRequest, NextResponse } from 'next/server';
import { McpGuard } from '@/lib/mcp-guard';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { requestId, decision } = body;

        if (!requestId || !decision || !['accept', 'reject'].includes(decision)) {
            return NextResponse.json({
                success: false,
                error: 'requestId and decision ("accept" | "reject") are required.'
            }, { status: 400 });
        }

        const success = McpGuard.resolveRequest(requestId, decision);
        if (!success) {
            return NextResponse.json({
                success: false,
                error: 'Request not found or already processed.'
            }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            message: `MCP Connection request ${decision}ed successfully.`,
            decision
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message || 'Internal Server Error'
        }, { status: 500 });
    }
}

export async function GET() {
    const pending = McpGuard.getPendingRequests();
    return NextResponse.json({ success: true, pending });
}
