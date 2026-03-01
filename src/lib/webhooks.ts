import { adminDb } from '@/lib/firebase-admin';

// --- Types ---

export type WebhookEvent = 'row.inserted' | 'row.updated' | 'row.deleted' | '*';

export interface Webhook {
    webhook_id: string;
    project_id: string;
    name: string;
    url: string;
    event: WebhookEvent;
    table_id: string; // Specific table ID or '*' for all tables
    secret?: string; // Optional secret for computing HMAC payloads
    is_active: boolean;
    created_at: string;
}

export interface WebhookPayload {
    event_type: WebhookEvent;
    table_id: string;
    timestamp: string;
    data: {
        new?: Record<string, any>;
        old?: Record<string, any>;
    };
}

// --- CRUD Operations ---

export async function getWebhooksForProject(projectId: string, userId: string): Promise<Webhook[]> {
    const snapshot = await adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('webhooks')
        .get();

    return snapshot.docs.map(doc => ({
        webhook_id: doc.id,
        ...doc.data()
    } as Webhook));
}

export async function createWebhook(projectId: string, userId: string, webhook: Omit<Webhook, 'webhook_id' | 'project_id' | 'created_at'>): Promise<Webhook> {
    const webhooksRef = adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('webhooks');

    const doc = webhooksRef.doc();

    const newWebhook: Webhook = {
        ...webhook,
        webhook_id: doc.id,
        project_id: projectId,
        created_at: new Date().toISOString()
    };

    await doc.set(newWebhook);
    return newWebhook;
}

export async function updateWebhook(projectId: string, userId: string, webhookId: string, updates: Partial<Omit<Webhook, 'webhook_id' | 'project_id' | 'created_at'>>): Promise<void> {
    const webhookRef = adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('webhooks').doc(webhookId);

    await webhookRef.update(updates);
}

export async function deleteWebhook(projectId: string, userId: string, webhookId: string): Promise<void> {
    const webhookRef = adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('webhooks').doc(webhookId);

    await webhookRef.delete();
}

// --- Dispatcher Engine ---

/**
 * Dispatches a payload to all active webhooks subscribed to a specific event on a specific table.
 * Designed to "fire and forget" via Promise.allSettled without blocking the main Database transaction.
 */
export async function fireWebhooks(
    projectId: string,
    userId: string,
    tableId: string,
    eventType: WebhookEvent,
    newData?: Record<string, any>,
    oldData?: Record<string, any>
) {
    try {
        const webhooks = await getWebhooksForProject(projectId, userId);

        // Filter down to Active Webhooks that match this Event and this Table
        const targetWebhooks = webhooks.filter(wh => {
            if (!wh.is_active) return false;

            const eventMatches = wh.event === '*' || wh.event === eventType;
            const tableMatches = wh.table_id === '*' || wh.table_id === tableId;

            return eventMatches && tableMatches;
        });

        if (targetWebhooks.length === 0) return;

        const payload: WebhookPayload = {
            event_type: eventType,
            table_id: tableId,
            timestamp: new Date().toISOString(),
            data: {
                ...(newData ? { new: newData } : {}),
                ...(oldData ? { old: oldData } : {})
            }
        };

        const dispatchPromises = targetWebhooks.map(async (webhook) => {
            try {
                // In the future, compute an HMAC signature using `crypto` if `webhook.secret` exists
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Fluxbase-Webhook-Engine/1.0',
                    'X-Fluxbase-Event': eventType
                };

                const response = await fetch(webhook.url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(5000) // 5 second hard timeout so we never hang indefinitely
                });

                if (!response.ok) {
                    console.error(`[Webhook Dispatch Error] ${webhook.url} returned status: ${response.status}`);
                }
            } catch (dispatchError) {
                console.error(`[Webhook Network Error] Failed to reach ${webhook.url}:`, dispatchError);
            }
        });

        // Fire and Forget so we don't throw an error to the user if Zapier is down
        await Promise.allSettled(dispatchPromises);

    } catch (criticalError) {
        // Log critical pipeline failures, but never throw out to `lib/data.ts` to protect database integrity
        console.error(`[Webhook Pipeline Critical Error] Project ${projectId}:`, criticalError);
    }
}
