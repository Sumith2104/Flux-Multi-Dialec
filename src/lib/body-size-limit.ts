import { NextRequest, NextResponse } from 'next/server';

const MAX_BODY_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Checks Content-Length header and rejects oversized requests early.
 * Add to API routes as a first-check guard.
 */
export function enforceBodySizeLimit(request: NextRequest, maxBytes: number = MAX_BODY_SIZE_BYTES): NextResponse | null {
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
        const bytes = parseInt(contentLength, 10);
        if (!isNaN(bytes) && bytes > maxBytes) {
            return NextResponse.json(
                { success: false, error: { message: `Request body too large. Maximum allowed: ${Math.round(maxBytes / 1024 / 1024)}MB`, code: 'PAYLOAD_TOO_LARGE' } },
                { status: 413 }
            );
        }
    }
    return null;
}
