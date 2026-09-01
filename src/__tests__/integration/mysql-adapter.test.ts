/**
 * Integration tests for the MySQL database adapter against a real MySQL 8
 * instance. The adapter previously shipped Postgres-style $N placeholders in
 * its information_schema queries — every introspection call failed at runtime.
 * These tests pin the corrected `?` placeholder behavior to the live engine.
 *
 * Target is the docker-compose.test.yml service:
 *   docker compose -f docker-compose.test.yml up -d
 *   npm run test:integration
 * Override with TEST_MYSQL_URL. Suite skips when MySQL is unreachable.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { MySqlAdapter } from '@/lib/db/adapters/mysql';

const TEST_MYSQL_URL =
    process.env.TEST_MYSQL_URL || 'mysql://test:testpassword@localhost:3307/fluxbase_test';
const TEST_DB = 'fluxbase_adapter_test';

let adapter: MySqlAdapter | null = null;

beforeAll(async () => {
    const probe = mysql.createPool({
        uri: TEST_MYSQL_URL,
        connectionLimit: 2,
        connectTimeout: 3000,
    });
    try {
        await probe.query('SELECT 1');
        adapter = new MySqlAdapter(probe);
    } catch {
        await probe.end().catch(() => {});
        adapter = null;
    }
});

beforeEach((ctx) => {
    if (!adapter) ctx.skip();
});

afterAll(async () => {
    if (adapter) {
        await adapter.dropSchema(TEST_DB).catch(() => {});
        await adapter.close().catch(() => {});
    }
});

describe('MySqlAdapter introspection (placeholder regression)', () => {
    beforeAll(async () => {
        if (!adapter) return;
        await adapter.dropSchema(TEST_DB).catch(() => {});
        await adapter.createSchema(TEST_DB);
        await adapter.query(
            `CREATE TABLE \`${TEST_DB}\`.\`orders\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant VARCHAR(64) NOT NULL,
                amount DECIMAL(10,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`
        );
        await adapter.query(
            `INSERT INTO \`${TEST_DB}\`.\`orders\` (tenant, amount) VALUES ('a', 10.50), ('b', 25.00)`
        );
    });

    it('healthCheck passes', async () => {
        expect(await adapter!.healthCheck()).toBe(true);
    });

    it('schemaExists finds the created database and not a missing one', async () => {
        expect(await adapter!.schemaExists(TEST_DB)).toBe(true);
        expect(await adapter!.schemaExists('fluxbase_adapter_missing')).toBe(false);
    });

    it('tableExists resolves within the right database', async () => {
        expect(await adapter!.tableExists('orders', TEST_DB)).toBe(true);
        expect(await adapter!.tableExists('nope', TEST_DB)).toBe(false);
    });

    it('getColumns returns typed column metadata', async () => {
        const columns = await adapter!.getColumns('orders', TEST_DB);
        const byName = Object.fromEntries(columns.map((c) => [c.name, c]));
        expect(byName.id.is_primary).toBeTruthy();
        expect(String(byName.id.type)).toBe('int');
        expect(byName.tenant.nullable).toBeFalsy();
        expect(String(byName.amount.type)).toBe('decimal');
    });

    it('getSchema lists tables in the database', async () => {
        const schema = await adapter!.getSchema(TEST_DB);
        const names = schema.tables.map((t) => t.name);
        expect(names).toContain('orders');
    });

    it('getRowCount counts rows', async () => {
        expect(await adapter!.getRowCount('orders', TEST_DB)).toBe(2);
    });

    it('query executes parameterized statements with ? placeholders', async () => {
        const result = await adapter!.query<any>(
            'SELECT tenant FROM orders WHERE amount > ? ORDER BY amount DESC',
            [20],
        );
        expect(result.rows).toEqual([{ tenant: 'b' }]);
    });

    it('bulkInsert writes rows and reports insertions', async () => {
        const result = await adapter!.bulkInsert(
            'orders',
            [
                { tenant: 'c', amount: 5 },
                { tenant: 'd', amount: 7 },
            ],
            TEST_DB,
        );
        expect(result.insertedRows).toBe(2);
        expect(result.errors).toEqual([]);
        expect(await adapter!.getRowCount('orders', TEST_DB)).toBe(4);
    });

    it('transaction commits atomically', async () => {
        const count = await adapter!.transaction(async (client) => {
            await client.query(
                `INSERT INTO \`${TEST_DB}\`.\`orders\` (tenant, amount) VALUES ('tx', 1)`,
            );
            const res = await client.query<any>('SELECT COUNT(*) AS count FROM orders');
            return Number(res.rows[0].count);
        });
        expect(count).toBe(5);
    });
});
