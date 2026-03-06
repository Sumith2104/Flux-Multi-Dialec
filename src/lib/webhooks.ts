import { getPgPool } from '@/lib/pg';
import crypto from 'crypto';

export type WebhookEvent = 'row.inserted' | 'row.updated' | 'row.deleted' | '*';

export interface Webhook {
    webhook_id: string;
    project_id: string;
    user_id: string;
    name: string;
    url: string;
    event: WebhookEvent;
    table_id: string; // Specific table name or '*' for all tables
    secret?: string;
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
    const pool = getPgPool();
    const result = await pool.query('SELECT * FROM fluxbase_global.webhooks WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC', [projectId, userId]);

    return result.rows.map(row => ({
        ...row,
        created_at: row.created_at.toISOString()
    } as Webhook));
}

export async function createWebhook(projectId: string, userId: string, webhook: Omit<Webhook, 'webhook_id' | 'project_id' | 'user_id' | 'created_at'>): Promise<Webhook> {
    const pool = getPgPool();
    const webhookId = crypto.randomUUID().replace(/-/g, '').substring(0, 20);

    const result = await pool.query(`
        INSERT INTO fluxbase_global.webhooks (webhook_id, project_id, user_id, name, url, event, table_id, secret, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, [webhookId, projectId, userId, webhook.name, webhook.url, webhook.event, webhook.table_id, webhook.secret || null, webhook.is_active !== false]);

    return {
        ...result.rows[0],
        created_at: result.rows[0].created_at.toISOString()
    } as Webhook;
}

export async function updateWebhook(projectId: string, userId: string, webhookId: string, updates: Partial<Omit<Webhook, 'webhook_id' | 'project_id' | 'user_id' | 'created_at'>>): Promise<void> {
    const pool = getPgPool();
    const setClauses = [];
    const params = [];
    let i = 1;

    for (const [key, value] of Object.entries(updates)) {
        if (['name', 'url', 'event', 'table_id', 'secret', 'is_active'].includes(key) && value !== undefined) {
            setClauses.push(`"${key}" = $${i++}`);
            params.push(value);
        }
    }

    if (setClauses.length === 0) return;

    params.push(webhookId, projectId, userId);
    await pool.query(`UPDATE fluxbase_global.webhooks SET ${setClauses.join(', ')} WHERE webhook_id = $${i} AND project_id = $${i + 1} AND user_id = $${i + 2}`, params);
}

export async function deleteWebhook(projectId: string, userId: string, webhookId: string): Promise<void> {
    const pool = getPgPool();
    await pool.query('DELETE FROM fluxbase_global.webhooks WHERE webhook_id = $1 AND project_id = $2 AND user_id = $3', [webhookId, projectId, userId]);
}

// --- Dispatcher Engine ---

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

        const payload: WebhookPayload = {
            event_type: eventType,
            table_id: tableId,
            timestamp: new Date().toISOString(),
            data: {
                ...(newData ? { new: newData } : {}),
                ...(oldData ? { old: oldData } : {})
            }
        };

        // --- INTERNAL LIVE UPDATE NOTIFY ---
        // Emit payload to Postgres so Serverless API routes (listen endpoints) can stream it instantly.
        try {
            const pool = getPgPool();
            // Postgres NOTIFY channels must be standard identifiers. 
            // We use a safe hash or simple clean project ID, or generic channel and parse payload.
            // A generic channel for all projects is fine because payload contains tableId, but project filtering is better.
            const channel = `fluxbase_live`;
            // Add project_id to the payload explicitly so listeners can filter
            const internalPayload = { ...payload, project_id: projectId };
            // Postgres NOTIFY payload must be a string literal, it does not support parameterized queries ($1) directly via node-postgres
            const payloadString = JSON.stringify(internalPayload).replace(/'/g, "''");
            await pool.query(`NOTIFY ${channel}, '${payloadString}'`);
        } catch (notifyErr) {
            console.error(`[INTERNAL LIVE UPDATE ERROR] Project ${projectId}:`, notifyErr);
        }

        const targetWebhooks = webhooks.filter(wh => {
            if (!wh.is_active) return false;
            const eventMatches = wh.event === '*' || wh.event === eventType;
            const tableMatches = wh.table_id === '*' || wh.table_id === tableId;
            return eventMatches && tableMatches;
        });

        if (targetWebhooks.length === 0) return;

        const dispatchPromises = targetWebhooks.map(async (webhook) => {
            try {
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Fluxbase-Webhook-Engine/1.0',
                    'X-Fluxbase-Event': eventType
                };

                const response = await fetch(webhook.url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(5000)
                });

                if (!response.ok) {
                    console.error(`[Webhook Dispatch Error] ${webhook.url} returned status: ${response.status}`);
                }
            } catch (dispatchError) {
                console.error(`[Webhook Network Error] Failed to reach ${webhook.url}:`, dispatchError);
            }
        });

        await Promise.allSettled(dispatchPromises);

    } catch (criticalError) {
        console.error(`[Webhook Pipeline Critical Error] Project ${projectId}:`, criticalError);
    }
}
