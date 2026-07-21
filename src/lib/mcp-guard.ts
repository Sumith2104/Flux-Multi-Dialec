export interface McpConnectionRequest {
    requestId: string;
    appName: string;
    origin?: string;
    ipAddress?: string;
    requestedAt: string;
    status: 'pending' | 'accepted' | 'rejected';
}

const pendingRequests = new Map<string, McpConnectionRequest>();
const approvedClients = new Set<string>();

export class McpGuard {
    /**
     * Intercepts an incoming MCP connection request and registers it for user verification.
     */
    public static registerConnectionRequest(appName: string, origin?: string, ipAddress?: string): McpConnectionRequest {
        const requestId = `mcp_req_${Math.random().toString(36).substring(2, 10)}`;
        const request: McpConnectionRequest = {
            requestId,
            appName,
            origin: origin || 'Unknown External App',
            ipAddress: ipAddress || '127.0.0.1',
            requestedAt: new Date().toISOString(),
            status: 'pending'
        };

        pendingRequests.set(requestId, request);

        // Notify client subscribers via custom event in browser context
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('flux:mcp-request', { detail: request }));
        }

        return request;
    }

    /**
     * Approves or rejects a pending MCP connection request.
     */
    public static resolveRequest(requestId: string, decision: 'accept' | 'reject'): boolean {
        const request = pendingRequests.get(requestId);
        if (!request) return false;

        request.status = decision === 'accept' ? 'accepted' : 'rejected';
        if (decision === 'accept') {
            approvedClients.add(request.appName);
        }

        pendingRequests.delete(requestId);

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('flux:mcp-resolved', { detail: { requestId, decision } }));
        }

        return true;
    }

    /**
     * Checks if an application has been explicitly approved by the user.
     */
    public static isAppApproved(appName: string): boolean {
        return approvedClients.has(appName);
    }

    /**
     * Retrieves all active pending connection requests requiring user confirmation.
     */
    public static getPendingRequests(): McpConnectionRequest[] {
        return Array.from(pendingRequests.values());
    }
}
