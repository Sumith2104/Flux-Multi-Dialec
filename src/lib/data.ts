'use server';

import { getPgPool } from '@/lib/pg';
import { getCurrentUserId } from '@/lib/auth';
import crypto from 'crypto';
import { validateRow } from '@/lib/validation';
import { fireWebhooks } from '@/lib/webhooks';
import { unstable_cache, revalidateTag } from 'next/cache';

// --- Types ---

export interface Project {
    project_id: string;
    user_id: string;
    display_name: string;
    created_at: string;
    dialect?: 'mysql' | 'postgresql' | 'oracle';
    timezone?: string;
    role?: string;
}

export interface Table {
    table_id: string;
    project_id: string;
    table_name: string;
    description: string;
    created_at: string;
    updated_at: string;
}

export interface Column {
    id?: string;
    column_id: string;
    table_id: string;
    column_name: string;
    data_type: 'INT' | 'VARCHAR' | 'BOOLEAN' | 'DATE' | 'TIMESTAMP' | 'FLOAT' | 'TEXT' |  // Uppercase (Legacy/Strict)
    'int' | 'varchar' | 'boolean' | 'date' | 'timestamp' | 'float' | 'text' | 'number' | // Lowercase (Runtime)
    'gen_random_uuid()' | 'now_date()' | 'now_time()'; // Special defaults/types
    is_primary_key: boolean;
    is_nullable: boolean;
    default_value?: string; // e.g. 'now()', 'uuid()'
    created_at?: string;
}

export interface Row {
    id: string;
    [key: string]: any;
}

export type ConstraintType = 'PRIMARY KEY' | 'FOREIGN KEY';
export type ReferentialAction = 'CASCADE' | 'SET NULL' | 'RESTRICT';

export interface Constraint {
    constraint_id: string;
    table_id: string;
    type: ConstraintType;
    column_names: string;
    referenced_table_id?: string;
    referenced_column_names?: string;
    on_delete?: ReferentialAction;
    on_update?: ReferentialAction;
}

// --- Projects ---

export async function getProjectsForCurrentUser(): Promise<Project[]> {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    try {
        const pool = getPgPool();
        const result = await pool.query(`
            SELECT p.project_id, p.display_name, p.created_at, p.dialect, p.timezone,
                   COALESCE(pm.role, CASE WHEN p.user_id = $1 THEN 'admin' ELSE 'developer' END) as role
            FROM fluxbase_global.projects p
            LEFT JOIN fluxbase_global.project_members pm ON p.project_id = pm.project_id AND pm.user_id = $1
            WHERE p.user_id = $1 OR pm.user_id = $1
            ORDER BY p.created_at DESC
        `, [userId]);

        return result.rows.map(row => ({
            project_id: row.project_id,
            user_id: userId,
            display_name: row.display_name,
            created_at: row.created_at.toISOString(),
            dialect: row.dialect,
            timezone: row.timezone,
            role: row.role
        }));
    } catch (error) {
        console.error("Error fetching projects:", error);
        return [];
    }
}

export async function getProjectById(projectId: string, explicitUserId?: string): Promise<Project | null> {
    const userId = explicitUserId || await getCurrentUserId();
    if (!userId) return null;

    try {
        const pool = getPgPool();
        const result = await pool.query(`
            SELECT p.project_id, p.display_name, p.created_at, p.dialect, p.timezone, p.user_id as owner_id,
                   COALESCE(pm.role, CASE WHEN p.user_id = $2 THEN 'admin' ELSE NULL END) as role
            FROM fluxbase_global.projects p
            LEFT JOIN fluxbase_global.project_members pm ON p.project_id = pm.project_id AND pm.user_id = $2
            WHERE p.project_id = $1 AND (p.user_id = $2 OR pm.user_id = $2)
        `, [projectId, userId]);
        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            project_id: row.project_id,
            user_id: row.owner_id, // preserve original owner identification
            display_name: row.display_name,
            created_at: row.created_at.toISOString(),
            dialect: row.dialect,
            timezone: row.timezone,
            role: row.role
        };
    } catch (error) {
        console.error("Error fetching project:", error);
        return null;
    }
}


// --- User Profile ---

export async function getUserProfile(userId: string) {
    try {
        const pool = getPgPool();
        const result = await pool.query('SELECT id, email, display_name, photo_url, created_at FROM fluxbase_global.users WHERE id = $1', [userId]);
        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
        console.error("Error fetching user profile:", error);
        return null;
    }
}

export async function createUserProfile(userId: string, email: string, displayName?: string, photoURL?: string) {
    // Mostly handled by native signupAction now, but here for compatibility
    const pool = getPgPool();
    try {
        await pool.query(
            'INSERT INTO fluxbase_global.users (id, email, display_name, photo_url) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING',
            [userId, email, displayName || email.split('@')[0], photoURL || null]
        );
    } catch (error) {
        console.error("createUserProfile error:", error);
        throw error;
    }
}

export async function updateUserProfile(userId: string, displayName?: string, photoURL?: string) {
    const pool = getPgPool();
    let updates = [];
    let values = [userId];
    let idx = 2;

    if (displayName) {
        updates.push(`display_name = $${idx++}`);
        values.push(displayName);
    }
    if (photoURL) {
        updates.push(`photo_url = $${idx++}`);
        values.push(photoURL);
    }

    if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        const query = `UPDATE fluxbase_global.users SET ${updates.join(', ')} WHERE id = $1`;
        await pool.query(query, values);
    }
}

export async function ensureUserProfile(userId: string, email: string, displayName?: string, photoURL?: string) {
    const profile = await getUserProfile(userId);
    if (!profile) {
        await createUserProfile(userId, email, displayName, photoURL);
    } else {
        await updateUserProfile(userId, displayName, photoURL);
    }
}


export async function createProject(name: string, description: string, dialect: string = 'mysql', timezone?: string): Promise<Project> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const pool = getPgPool();

    // Fetch Subscription Plan from DB
    const userSnapshot = await pool.query('SELECT plan_type FROM fluxbase_global.users WHERE id = $1', [userId]);
    const planType = userSnapshot.rows[0]?.plan_type || 'free';

    let maxProjects = 1;
    if (planType === 'pro') maxProjects = 3;
    if (planType === 'max') maxProjects = 999999;

    // Check limit
    const projectsSnapshot = await pool.query('SELECT COUNT(*) as count FROM fluxbase_global.projects WHERE user_id = $1', [userId]);
    const count = parseInt(projectsSnapshot.rows[0].count);
    if (count >= maxProjects) {
        throw new Error(`Project limit reached. Your ${planType.toUpperCase()} plan only allows ${maxProjects} project(s). Please upgrade your subscription to create more.`);
    }

    const projectId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const finalTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    await pool.query(
        'INSERT INTO fluxbase_global.projects (project_id, user_id, display_name, dialect, timezone) VALUES ($1, $2, $3, $4, $5)',
        [projectId, userId, name, dialect, finalTimezone]
    );

    const project: Project = {
        project_id: projectId,
        user_id: userId,
        display_name: name,
        created_at: new Date().toISOString(),
        dialect: dialect as any,
        timezone: finalTimezone
    };

    // [AWS NATIVE MIGRATION] Automatically provision a dedicated Schema/DB for this tenant.
    try {
        if (dialect.toLowerCase() === 'mysql') {
            const { getMysqlPool } = await import('@/lib/mysql');
            const mysqlPool = getMysqlPool();
            await mysqlPool.query(`CREATE DATABASE \`project_${projectId}\``);
            console.log(`[Fluxbase Native] Successfully provisioned MySQL DB: project_${projectId}`);
        } else {
            // Default PostgreSQL Schema approach
            await pool.query(`CREATE SCHEMA IF NOT EXISTS "project_${projectId}"`);
            console.log(`[Fluxbase Native] Successfully provisioned PG Schema: project_${projectId}`);
        }
    } catch (dbError) {
        console.error(`[Fluxbase Native] Failed to provision native environment for project_${projectId}`, dbError);
    }

    return project;
}

export async function resetProjectData(projectId: string) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const pool = getPgPool();
    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    if (project.dialect?.toLowerCase() === 'mysql') {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        await mysqlPool.query(`DROP DATABASE IF EXISTS \`project_${projectId}\``);
        await mysqlPool.query(`CREATE DATABASE \`project_${projectId}\``);
    } else {
        const schemaName = `project_${projectId}`;
        // Drop and recreate schema to wipe all data natively
        await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        await pool.query(`CREATE SCHEMA "${schemaName}"`);
    }
}

export async function updateProjectTimezone(projectId: string, timezone: string): Promise<boolean> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const pool = getPgPool();
    await pool.query(
        'UPDATE fluxbase_global.projects SET timezone = $1 WHERE project_id = $2 AND user_id = $3',
        [timezone, projectId, userId]
    );

    return true;
}

export async function deleteProject(projectId: string) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const pool = getPgPool();
    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found or access denied.");

    if (project.dialect?.toLowerCase() === 'mysql') {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        await mysqlPool.query(`DROP DATABASE IF EXISTS \`project_${projectId}\``);
    } else {
        // Drop the tenant's isolated schema
        const schemaName = `project_${projectId}`;
        await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    }

    // Remove the catalog entry
    await pool.query('DELETE FROM fluxbase_global.projects WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
}

// --- Tables ---

export async function getTablesForProject(projectId: string, explicitUserId?: string): Promise<Table[]> {
    const userId = explicitUserId || await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found or access denied.");

    try {
        if (project.dialect?.toLowerCase() === 'mysql') {
            const { getMysqlPool } = await import('@/lib/mysql');
            const mysqlPool = getMysqlPool();
            const dbName = `project_${projectId}`;

            const [rows]: any = await mysqlPool.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = ? AND table_type = 'BASE TABLE'
            `, [dbName]);

            return rows.map((row: any) => ({
                table_id: row.TABLE_NAME || row.table_name,
                project_id: projectId,
                table_name: row.TABLE_NAME || row.table_name,
                description: "Managed by Fluxbase Native MySQL",
                created_at: project.created_at,
                updated_at: new Date().toISOString()
            }));

        } else {
            const pool = getPgPool();
            const schemaName = `project_${projectId}`;

            const result = await pool.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = $1 AND table_type = 'BASE TABLE'
            `, [schemaName]);

            return result.rows.map(row => ({
                table_id: row.table_name,
                project_id: projectId,
                table_name: row.table_name,
                description: "Managed by Fluxbase Native Postgres",
                created_at: project.created_at,
                updated_at: new Date().toISOString()
            }));
        }
    } catch (error) {
        console.error("Error fetching tables from AWS:", error);
        return [];
    }
}

export async function createTable(projectId: string, tableName: string, description: string, columns: Column[], explicitUserId?: string): Promise<Table> {
    const userId = explicitUserId || await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');

    if (project.dialect?.toLowerCase() === 'mysql') {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        const dbName = `project_${projectId}`;

        let columnDefs = [];
        for (const col of columns) {
            let type = col.data_type.toUpperCase();
            if (type === 'NUMBER') type = 'DOUBLE';
            else if (type === 'VARCHAR') type = 'VARCHAR(255)';
            else if (type === 'BOOLEAN') type = 'TINYINT(1)';

            let def = `\`${col.column_name}\` ${type}`;

            if (col.is_primary_key) {
                if (type.includes('VARCHAR')) def = `\`${col.column_name}\` VARCHAR(255) PRIMARY KEY`;
                else def += ' PRIMARY KEY';
            } else if (!col.is_nullable) {
                def += ' NOT NULL';
            }

            if (col.default_value) {
                if (col.default_value.includes('now()')) def += ' DEFAULT CURRENT_TIMESTAMP';
                else if (col.default_value.includes('uuid()')) def += ' DEFAULT (UUID())';
                else def += ` DEFAULT '${col.default_value}'`;
            }
            columnDefs.push(def);
        }

        const ddl = `CREATE TABLE \`${dbName}\`.\`${safeTableName}\` (${columnDefs.join(', ')})`;
        await mysqlPool.query(ddl);

    } else {
        const pool = getPgPool();
        const schemaName = `project_${projectId}`;

        let columnDefs = [];
        for (const col of columns) {
            let type = col.data_type.toUpperCase();
            if (type === 'NUMBER') type = 'NUMERIC';
            else if (type === 'VARCHAR') type = 'VARCHAR(255)';

            let def = `"${col.column_name}" ${type}`;

            if (col.is_primary_key) {
                if (type === 'VARCHAR(255)') def = `"${col.column_name}" VARCHAR(128) PRIMARY KEY`;
                else def += ' PRIMARY KEY';
            } else if (!col.is_nullable) {
                def += ' NOT NULL';
            }

            if (col.default_value) {
                if (col.default_value.includes('now()')) def += ' DEFAULT CURRENT_TIMESTAMP';
                else if (col.default_value.includes('uuid()')) def += ' DEFAULT gen_random_uuid()';
                else def += ` DEFAULT '${col.default_value}'`;
            }
            columnDefs.push(def);
        }

        const ddl = `CREATE TABLE "${schemaName}"."${safeTableName}" (${columnDefs.join(', ')})`;
        await pool.query(ddl);

        // --- Phase 2: PostgreSQL Realtime Event Trigger ---
        const triggerFunctionSql = `
            CREATE OR REPLACE FUNCTION "${schemaName}".notify_table_change()
            RETURNS trigger AS $$
            DECLARE
              payload JSON;
              row_data RECORD;
            BEGIN
              IF TG_OP = 'DELETE' THEN
                row_data := OLD;
              ELSE
                row_data := NEW;
              END IF;

              payload := json_build_object(
                'table', TG_TABLE_NAME,
                'project_id', '${projectId}',
                'operation', TG_OP,
                'data', row_to_json(row_data)
              );

              PERFORM pg_notify('fluxbase_changes', payload::text);
              RETURN row_data;
            END;
            $$ LANGUAGE plpgsql;
        `;
        await pool.query(triggerFunctionSql);

        const attachTriggerSql = `
            CREATE TRIGGER "${safeTableName}_ws_trigger"
            AFTER INSERT OR UPDATE OR DELETE
            ON "${schemaName}"."${safeTableName}"
            FOR EACH ROW
            EXECUTE FUNCTION "${schemaName}".notify_table_change();
        `;
        await pool.query(attachTriggerSql);
    }

    const { invalidateTableCache } = await import('@/lib/cache');
    invalidateTableCache(projectId, safeTableName);

    return {
        table_id: safeTableName,
        project_id: projectId,
        table_name: safeTableName,
        description,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
}

export async function deleteTable(projectId: string, tableId: string, explicitUserId?: string) {
    const userId = explicitUserId || await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    const safeTableName = tableId.replace(/[^a-zA-Z0-9_]/g, '');

    if (project.dialect?.toLowerCase() === 'mysql') {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        const dbName = `project_${projectId}`;
        await mysqlPool.query(`DROP TABLE IF EXISTS \`${dbName}\`.\`${safeTableName}\``);
    } else {
        const pool = getPgPool();
        const schemaName = `project_${projectId}`;
        await pool.query(`DROP TABLE IF EXISTS "${schemaName}"."${safeTableName}" CASCADE`);
    }

    const { invalidateTableCache } = await import('@/lib/cache');
    invalidateTableCache(projectId, tableId);
}


// --- Columns ---

export async function getColumnsForTable(projectId: string, tableId: string, explicitUserId?: string): Promise<Column[]> {
    const userId = explicitUserId || await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    const safeTableName = tableId.replace(/[^a-zA-Z0-9_]/g, '');

    try {
        if (project.dialect?.toLowerCase() === 'mysql') {
            const { getMysqlPool } = await import('@/lib/mysql');
            const mysqlPool = getMysqlPool();
            const dbName = `project_${projectId}`;

            const [result]: any = await mysqlPool.query(`
                SELECT 
                    COLUMN_NAME as column_name, 
                    DATA_TYPE as data_type, 
                    IS_NULLABLE as is_nullable, 
                    COLUMN_DEFAULT as column_default,
                    CASE WHEN COLUMN_KEY = 'PRI' THEN true ELSE false END as is_primary_key
                FROM information_schema.columns 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                ORDER BY ORDINAL_POSITION
            `, [dbName, safeTableName]);

            return result.map((row: any) => ({
                column_id: row.column_name,
                table_id: safeTableName,
                column_name: row.column_name,
                data_type: row.data_type,
                is_nullable: row.is_nullable === 'YES',
                is_primary_key: row.is_primary_key === 1 || row.is_primary_key === true,
                default_value: row.column_default,
                created_at: new Date().toISOString()
            }));

        } else {
            const pool = getPgPool();
            const schemaName = `project_${projectId}`;

            // Fetch columns and identify primary keys
            const result = await pool.query(`
                SELECT 
                    c.column_name, 
                    c.data_type, 
                    c.is_nullable, 
                    c.column_default,
                    (
                        SELECT count(*) > 0
                        FROM information_schema.key_column_usage kcu
                        JOIN information_schema.table_constraints tc 
                            ON kcu.constraint_name = tc.constraint_name
                        WHERE tc.constraint_type = 'PRIMARY KEY' 
                            AND kcu.table_schema = c.table_schema 
                            AND kcu.table_name = c.table_name 
                            AND kcu.column_name = c.column_name
                    ) as is_primary_key
                FROM information_schema.columns c
                WHERE c.table_schema = $1 AND c.table_name = $2
                ORDER BY c.ordinal_position
            `, [schemaName, safeTableName]);

            return result.rows.map(row => ({
                column_id: row.column_name, // natively, name is ID
                table_id: safeTableName,
                column_name: row.column_name,
                data_type: row.data_type as any,
                is_nullable: row.is_nullable === 'YES',
                is_primary_key: row.is_primary_key,
                default_value: row.column_default,
                created_at: new Date().toISOString()
            }));
        }
    } catch (error) {
        console.error("Native Get Columns Error:", error);
        return [];
    }
}

export async function addColumn(projectId: string, tableId: string, column: Omit<Column, 'column_id' | 'table_id'>, explicitUserId?: string) {
    const userId = explicitUserId || await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    const safeTableName = tableId.replace(/[^a-zA-Z0-9_]/g, '');

    if (project.dialect?.toLowerCase() === 'mysql') {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        const dbName = `project_${projectId}`;

        let type = column.data_type.toUpperCase();
        if (type === 'NUMBER') type = 'DOUBLE';
        else if (type === 'VARCHAR') type = 'VARCHAR(255)';
        else if (type === 'BOOLEAN') type = 'TINYINT(1)';

        let def = `ADD COLUMN \`${column.column_name}\` ${type}`;
        if (!column.is_nullable && !column.is_primary_key) def += ' NOT NULL';
        if (column.default_value) {
            if (column.default_value.includes('now()')) def += ' DEFAULT CURRENT_TIMESTAMP';
            else if (column.default_value.includes('uuid()')) def += ' DEFAULT (UUID())';
            else def += ` DEFAULT '${column.default_value}'`;
        }

        await mysqlPool.query(`ALTER TABLE \`${dbName}\`.\`${safeTableName}\` ${def}`);

    } else {
        const pool = getPgPool();
        const schemaName = `project_${projectId}`;

        let type = column.data_type.toUpperCase();
        if (type === 'NUMBER') type = 'NUMERIC';
        else if (type === 'VARCHAR') type = 'VARCHAR(255)';

        let def = `ADD COLUMN "${column.column_name}" ${type}`;
        if (!column.is_nullable && !column.is_primary_key) def += ' NOT NULL';
        if (column.default_value) {
            if (column.default_value.includes('now()')) def += ' DEFAULT CURRENT_TIMESTAMP';
            else if (column.default_value.includes('uuid()')) def += ' DEFAULT gen_random_uuid()';
            else def += ` DEFAULT '${column.default_value}'`;
        }

        await pool.query(`ALTER TABLE "${schemaName}"."${safeTableName}" ${def}`);
    }

    const { invalidateTableCache } = await import('@/lib/cache');
    invalidateTableCache(projectId, tableId);
    revalidateTag(`columns-${projectId}-${tableId}`);
}

export async function deleteColumn(projectId: string, tableId: string, columnId: string) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    const safeTableName = tableId.replace(/[^a-zA-Z0-9_]/g, '');
    const safeColName = columnId.replace(/[^a-zA-Z0-9_]/g, '');

    if (project.dialect?.toLowerCase() === 'mysql') {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        const dbName = `project_${projectId}`;
        await mysqlPool.query(`ALTER TABLE \`${dbName}\`.\`${safeTableName}\` DROP COLUMN \`${safeColName}\``);
    } else {
        const pool = getPgPool();
        const schemaName = `project_${projectId}`;
        await pool.query(`ALTER TABLE "${schemaName}"."${safeTableName}" DROP COLUMN "${safeColName}" CASCADE`);
    }

    const { invalidateTableCache } = await import('@/lib/cache');
    invalidateTableCache(projectId, tableId);
    revalidateTag(`columns-${projectId}-${tableId}`);
}

export async function updateColumn(projectId: string, tableId: string, columnId: string, updates: Partial<Column>) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");
    const safeTableName = tableId.replace(/[^a-zA-Z0-9_]/g, '');
    const safeColName = columnId.replace(/[^a-zA-Z0-9_]/g, '');

    if (project.dialect?.toLowerCase() === 'mysql') {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        const dbName = `project_${projectId}`;

        if (updates.column_name && updates.column_name !== columnId) {
            const newName = updates.column_name.replace(/[^a-zA-Z0-9_]/g, '');
            // MySQL requires specifying the type again when renaming, but for simplicity we'll just rename
            await mysqlPool.query(`ALTER TABLE \`${dbName}\`.\`${safeTableName}\` RENAME COLUMN \`${safeColName}\` TO \`${newName}\``);
        }

        if (updates.data_type) {
            let type = updates.data_type.toUpperCase();
            if (type === 'NUMBER') type = 'DOUBLE';
            else if (type === 'VARCHAR') type = 'VARCHAR(255)';
            else if (type === 'BOOLEAN') type = 'TINYINT(1)';

            // Note: IF renamed above, safeColName variable might not perfectly align in one transaction, but assuming sequential for now or only one update at a time from frontend.
            const targetCol = (updates.column_name && updates.column_name !== columnId) ? updates.column_name.replace(/[^a-zA-Z0-9_]/g, '') : safeColName;
            await mysqlPool.query(`ALTER TABLE \`${dbName}\`.\`${safeTableName}\` MODIFY COLUMN \`${targetCol}\` ${type}`);
        }

    } else {
        const pool = getPgPool();
        const schemaName = `project_${projectId}`;

        // Changing column types/names natively with ALTER TABLE
        if (updates.column_name && updates.column_name !== columnId) {
            const newName = updates.column_name.replace(/[^a-zA-Z0-9_]/g, '');
            await pool.query(`ALTER TABLE "${schemaName}"."${safeTableName}" RENAME COLUMN "${safeColName}" TO "${newName}"`);
        }

        if (updates.data_type) {
            let type = updates.data_type.toUpperCase();
            if (type === 'NUMBER') type = 'NUMERIC';
            else if (type === 'VARCHAR') type = 'VARCHAR(255)';

            const targetCol = (updates.column_name && updates.column_name !== columnId) ? updates.column_name.replace(/[^a-zA-Z0-9_]/g, '') : safeColName;
            await pool.query(`ALTER TABLE "${schemaName}"."${safeTableName}" ALTER COLUMN "${targetCol}" TYPE ${type} USING "${targetCol}"::${type}`);
        }
    }

    const { invalidateTableCache } = await import('@/lib/cache');
    invalidateTableCache(projectId, tableId);
    revalidateTag(`columns-${projectId}-${tableId}`);
}


// --- Constraints ---

export async function getConstraintsForProject(projectId: string): Promise<Constraint[]> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    try {
        if (project.dialect?.toLowerCase() === 'mysql') {
            const { getMysqlPool } = await import('@/lib/mysql');
            const mysqlPool = getMysqlPool();
            const dbName = `project_${projectId}`;

            const [result]: any = await mysqlPool.query(`
                SELECT 
                    tc.TABLE_NAME as table_id,
                    tc.CONSTRAINT_NAME as constraint_id,
                    tc.CONSTRAINT_TYPE as type,
                    kcu.COLUMN_NAME as column_names,
                    kcu.REFERENCED_TABLE_NAME as referenced_table_id,
                    kcu.REFERENCED_COLUMN_NAME as referenced_column_names,
                    rc.DELETE_RULE as on_delete,
                    rc.UPDATE_RULE as on_update
                FROM information_schema.TABLE_CONSTRAINTS tc
                JOIN information_schema.KEY_COLUMN_USAGE kcu
                  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA AND tc.TABLE_NAME = kcu.TABLE_NAME
                LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
                  ON tc.CONSTRAINT_NAME = rc.CONSTRAINT_NAME AND tc.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
                WHERE tc.TABLE_SCHEMA = ?
            `, [dbName]);

            return result;
        } else {
            const pool = getPgPool();
            const schemaName = `project_${projectId}`;

            const result = await pool.query(`
                SELECT 
                    tc.table_name as table_id,
                    tc.constraint_name as constraint_id, 
                    tc.constraint_type as type,
                    kcu.column_name as column_names, 
                    ccu.table_name AS referenced_table_id,
                    ccu.column_name AS referenced_column_names
                FROM information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                LEFT JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
                WHERE tc.table_schema = $1 AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
            `, [schemaName]);

            return result.rows;
        }
    } catch (error) {
        console.error("Native Get Project Constraints Error:", error);
        return [];
    }
}

export async function getConstraintsForTable(projectId: string, tableId: string): Promise<Constraint[]> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    const safeTableName = tableId.replace(/[^a-zA-Z0-9_]/g, '');

    try {
        if (project.dialect?.toLowerCase() === 'mysql') {
            const { getMysqlPool } = await import('@/lib/mysql');
            const mysqlPool = getMysqlPool();
            const dbName = `project_${projectId}`;

            const [result]: any = await mysqlPool.query(`
                SELECT 
                    tc.CONSTRAINT_NAME as constraint_id,
                    tc.CONSTRAINT_TYPE as type,
                    kcu.COLUMN_NAME as column_names,
                    kcu.REFERENCED_TABLE_NAME as referenced_table_id,
                    kcu.REFERENCED_COLUMN_NAME as referenced_column_names,
                    rc.DELETE_RULE as on_delete,
                    rc.UPDATE_RULE as on_update
                FROM information_schema.TABLE_CONSTRAINTS tc
                JOIN information_schema.KEY_COLUMN_USAGE kcu
                  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA AND tc.TABLE_NAME = kcu.TABLE_NAME
                LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
                  ON tc.CONSTRAINT_NAME = rc.CONSTRAINT_NAME AND tc.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
                WHERE tc.TABLE_SCHEMA = ? AND tc.TABLE_NAME = ?
                  AND tc.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'FOREIGN KEY')
            `, [dbName, safeTableName]);

            return result.map((row: any) => ({
                constraint_id: row.constraint_id,
                table_id: safeTableName,
                type: row.type as ConstraintType,
                column_names: row.column_names,
                referenced_table_id: row.referenced_table_id,
                referenced_column_names: row.referenced_column_names,
                on_delete: row.on_delete as any,
                on_update: row.on_update as any
            }));
        } else {
            const pool = getPgPool();
            const schemaName = `project_${projectId}`;
            const result = await pool.query(`
                SELECT 
                    tc.constraint_name as constraint_id,
                    tc.constraint_type as type,
                    kcu.column_name as column_names,
                    ccu.table_name as referenced_table_id,
                    ccu.column_name as referenced_column_names,
                    rc.delete_rule as on_delete,
                    rc.update_rule as on_update
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema AND tc.table_name = kcu.table_name
                LEFT JOIN information_schema.referential_constraints rc
                  ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
                LEFT JOIN information_schema.constraint_column_usage ccu
                  ON rc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
                WHERE tc.table_schema = $1 AND tc.table_name = $2
                  AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
            `, [schemaName, safeTableName]);

            return result.rows.map(row => ({
                constraint_id: row.constraint_id,
                table_id: safeTableName,
                type: row.type as ConstraintType,
                column_names: row.column_names,
                referenced_table_id: row.referenced_table_id,
                referenced_column_names: row.referenced_column_names,
                on_delete: row.on_delete as any,
                on_update: row.on_update as any
            }));
        }
    } catch (error) {
        console.error("Native Get Constraints Error:", error);
        return [];
    }
}

export async function addConstraint(projectId: string, constraint: Omit<Constraint, 'constraint_id'>) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    const safeTableName = constraint.table_id.replace(/[^a-zA-Z0-9_]/g, '');
    const colName = constraint.column_names.replace(/[^a-zA-Z0-9_]/g, '');

    if (project.dialect?.toLowerCase() === 'mysql') {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        const dbName = `project_${projectId}`;

        let ddl = `ALTER TABLE \`${dbName}\`.\`${safeTableName}\` ADD CONSTRAINT \`${safeTableName}_${colName}_${Date.now()}\` `;

        if (constraint.type === 'PRIMARY KEY') {
            ddl += `PRIMARY KEY (\`${colName}\`)`;
        } else if (constraint.type === 'FOREIGN KEY' && constraint.referenced_table_id && constraint.referenced_column_names) {
            const refTable = constraint.referenced_table_id.replace(/[^a-zA-Z0-9_]/g, '');
            const refCol = constraint.referenced_column_names.replace(/[^a-zA-Z0-9_]/g, '');
            ddl += `FOREIGN KEY (\`${colName}\`) REFERENCES \`${dbName}\`.\`${refTable}\` (\`${refCol}\`)`;

            if (constraint.on_delete) ddl += ` ON DELETE ${constraint.on_delete}`;
            if (constraint.on_update) ddl += ` ON UPDATE ${constraint.on_update}`;
        }

        await mysqlPool.query(ddl);
    } else {
        const pool = getPgPool();
        const schemaName = `project_${projectId}`;

        let ddl = `ALTER TABLE "${schemaName}"."${safeTableName}" ADD CONSTRAINT "${safeTableName}_${colName}_${Date.now()}" `;

        if (constraint.type === 'PRIMARY KEY') {
            ddl += `PRIMARY KEY ("${colName}")`;
        } else if (constraint.type === 'FOREIGN KEY' && constraint.referenced_table_id && constraint.referenced_column_names) {
            const refTable = constraint.referenced_table_id.replace(/[^a-zA-Z0-9_]/g, '');
            const refCol = constraint.referenced_column_names.replace(/[^a-zA-Z0-9_]/g, '');
            ddl += `FOREIGN KEY ("${colName}") REFERENCES "${schemaName}"."${refTable}" ("${refCol}")`;

            if (constraint.on_delete) ddl += ` ON DELETE ${constraint.on_delete}`;
            if (constraint.on_update) ddl += ` ON UPDATE ${constraint.on_update}`;
        }

        await pool.query(ddl);
    }
}

export async function deleteConstraint(projectId: string, constraintId: string, tableId?: string) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    if (!tableId) throw new Error("Table ID required for native constraint deletion");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    const safeTableName = tableId.replace(/[^a-zA-Z0-9_]/g, '');
    const safeConstraint = constraintId.replace(/[^a-zA-Z0-9_]/g, '');

    if (project.dialect?.toLowerCase() === 'mysql') {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        const dbName = `project_${projectId}`;

        // Use DROP FOREIGN KEY / DROP INDEX depending on constraint type if possible, or try standard DROP CONSTRAINT (MySQL 8.0.19+)
        await mysqlPool.query(`ALTER TABLE \`${dbName}\`.\`${safeTableName}\` DROP CONSTRAINT \`${safeConstraint}\``);
    } else {
        const pool = getPgPool();
        const schemaName = `project_${projectId}`;

        await pool.query(`ALTER TABLE "${schemaName}"."${safeTableName}" DROP CONSTRAINT "${safeConstraint}"`);
    }
}


// --- Validation ---




// --- Rows (Data) ---

export async function getTableData(
    projectId: string,
    tableName: string,
    page: number = 0,
    pageSize: number = 50,
    explicitUserId?: string,
    cursorId?: string
) {
    const userId = explicitUserId || await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    const limit = Math.min(Math.max(1, pageSize), 100);
    const offset = page * limit;

    try {
        const { getCachedTableRows, setCachedTableRows } = await import('@/lib/cache');

        // Check Redis Cache First
        const cachedData = await getCachedTableRows(projectId, tableName, page);
        if (cachedData) {
            console.log(`[DEBUG] Serving Redis cached table data for ${tableName} page ${page}`);
            return cachedData;
        }

        let rows = [];
        let totalRows = 0;

        if (project.dialect?.toLowerCase() === 'mysql') {
            const { getMysqlPool } = await import('@/lib/mysql');
            const mysqlPool = getMysqlPool();
            const dbName = `project_${projectId}`;

            const [dataResult]: any = await mysqlPool.query(`SELECT * FROM \`${dbName}\`.\`${safeTableName}\` LIMIT ${limit} OFFSET ${offset}`);
            const [countResult]: any = await mysqlPool.query(`SELECT COUNT(*) as count FROM \`${dbName}\`.\`${safeTableName}\``);

            totalRows = parseInt(countResult[0].count);

            const [pkColResult]: any = await mysqlPool.query(`
                SELECT COLUMN_NAME as column_name
                FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_KEY = 'PRI' LIMIT 1
            `, [dbName, safeTableName]);

            const pkName = pkColResult.length > 0 ? pkColResult[0].column_name : null;

            rows = dataResult.map((row: any, index: number) => {
                let idField = null;
                if (pkName && row[pkName]) idField = row[pkName];
                else idField = row.id || row.uuid || `row_${offset + index}`;

                return {
                    ...row,
                    id: idField,
                    _id: idField
                };
            });

        } else {
            const pool = getPgPool();
            const schemaName = `project_${projectId}`;

            const dataResult = await pool.query(`SELECT * FROM "${schemaName}"."${safeTableName}" LIMIT $1 OFFSET $2`, [limit, offset]);
            const countResult = await pool.query(`SELECT COUNT(*) FROM "${schemaName}"."${safeTableName}"`);

            totalRows = parseInt(countResult.rows[0].count);
            const pkColResult = await pool.query(`
                SELECT kcu.column_name 
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2 LIMIT 1
            `, [schemaName, safeTableName]);

            const pkName = pkColResult.rows.length > 0 ? pkColResult.rows[0].column_name : null;

            rows = dataResult.rows.map((row, index) => {
                let idField = null;
                if (pkName && row[pkName]) idField = row[pkName];
                else idField = row.id || row.uuid || `row_${offset + index}`;

                return {
                    ...row,
                    id: idField,
                    _id: idField
                };
            });
        }

        const payload = {
            rows,
            totalRows,
            nextCursorId: (offset + limit) < totalRows ? String(page + 1) : null,
            hasMore: (offset + limit) < totalRows
        };

        // Cache the newly fetched page
        await setCachedTableRows(projectId, tableName, page, payload);

        return payload;
    } catch (error) {
        console.error("Native getTableData error:", error);
        return { rows: [], totalRows: 0, nextCursorId: null, hasMore: false };
    }
}

export async function insertRow(projectId: string, tableId: string, rowData: Record<string, any>) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    const columns = await getColumnsForTable(projectId, tableId);
    validateRow(rowData as Row, columns);

    const safeTableName = tableId.replace(/[^a-zA-Z0-9_]/g, '');

    const cols = [];
    const vals = [];
    const params = [];
    let i = 1;

    for (const [key, value] of Object.entries(rowData)) {
        if (key === 'id' || key === '_id') continue;
        if (columns.some(c => c.column_name === key)) {
            // MySQL uses ``, Postgres uses ""
            cols.push(project.dialect?.toLowerCase() === 'mysql' ? `\`${key.replace(/[^a-zA-Z0-9_]/g, '')}\`` : `"${key.replace(/[^a-zA-Z0-9_]/g, '')}"`);

            if (project.dialect?.toLowerCase() === 'mysql') {
                vals.push(`?`);
            } else {
                vals.push(`$${i++}`);
            }
            params.push(value);
        }
    }

    if (cols.length === 0) throw new Error("No valid columns provided for insertion.");

    try {
        let insertedRow;

        if (project.dialect?.toLowerCase() === 'mysql') {
            const { getMysqlPool } = await import('@/lib/mysql');
            const mysqlPool = getMysqlPool();
            const dbName = `project_${projectId}`;

            // MySQL does not naturally support RETURNING *. We do an INSERT then a SELECT of the last insert if needed, 
            // but for simple webhook fire, we'll try to reconstruct the object locally since this is a basic interface.
            const ddl = `INSERT INTO \`${dbName}\`.\`${safeTableName}\` (${cols.join(', ')}) VALUES (${vals.join(', ')})`;

            try {
                const [result]: any = await mysqlPool.query(ddl, params);
                insertedRow = { ...rowData, _internal_last_id: result.insertId }; // Approximation
            } catch (mysqlError: any) {
                if (mysqlError.code === 'ER_DUP_ENTRY') throw new Error(`Duplicate entry for unique/primary key constraint.`);
                throw mysqlError;
            }

        } else {
            const pool = getPgPool();
            const schemaName = `project_${projectId}`;
            const ddl = `INSERT INTO "${schemaName}"."${safeTableName}" (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING *`;

            try {
                const result = await pool.query(ddl, params);
                insertedRow = result.rows[0];
            } catch (pgError: any) {
                if (pgError.code === '23505') throw new Error(`Duplicate entry for unique/primary key constraint.`);
                throw pgError;
            }
        }

        const { invalidateTableCache } = await import('@/lib/cache');
        await invalidateTableCache(projectId, tableId);

        fireWebhooks(projectId, userId, tableId, 'row.inserted', insertedRow).catch(err => {
            console.error(`[Webhook Fire Error] ${tableId} insert:`, err);
        });
    } catch (error: any) {
        throw new Error(`Insertion failed: ${error.message}`);
    }
}

export async function updateRow(projectId: string, tableId: string, rowId: string, updates: Record<string, any>) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    const columns = await getColumnsForTable(projectId, tableId);
    const pkCol = columns.find(c => c.is_primary_key);

    if (!pkCol) {
        throw new Error("Table must have a Primary Key to update specific rows natively.");
    }

    const safeTableName = tableId.replace(/[^a-zA-Z0-9_]/g, '');
    const setClauses = [];
    const params = [];
    let i = 1;

    for (const [key, value] of Object.entries(updates)) {
        if (key === 'id' || key === '_id' || key === pkCol.column_name) continue;
        if (columns.some(c => c.column_name === key) && value !== undefined) {
            setClauses.push(project.dialect?.toLowerCase() === 'mysql' ? `\`${key.replace(/[^a-zA-Z0-9_]/g, '')}\` = ?` : `"${key.replace(/[^a-zA-Z0-9_]/g, '')}" = $${i++}`);
            params.push(value);
        }
    }

    if (setClauses.length === 0) return;

    params.push(rowId);

    try {
        let updatedRow;
        let oldData;

        if (project.dialect?.toLowerCase() === 'mysql') {
            const { getMysqlPool } = await import('@/lib/mysql');
            const mysqlPool = getMysqlPool();
            const dbName = `project_${projectId}`;

            const [oldDataResult]: any = await mysqlPool.query(`SELECT * FROM \`${dbName}\`.\`${safeTableName}\` WHERE \`${pkCol.column_name}\` = ?`, [rowId]);
            if (oldDataResult.length === 0) throw new Error(`Row with PK '${rowId}' not found.`);
            oldData = oldDataResult[0];

            const ddl = `UPDATE \`${dbName}\`.\`${safeTableName}\` SET ${setClauses.join(', ')} WHERE \`${pkCol.column_name}\` = ?`;
            await mysqlPool.query(ddl, params);

            // MySQL lacks RETURNING *, grab it again or approximate
            updatedRow = { ...oldData, ...updates };

        } else {
            const pool = getPgPool();
            const schemaName = `project_${projectId}`;

            const oldDataResult = await pool.query(`SELECT * FROM "${schemaName}"."${safeTableName}" WHERE "${pkCol.column_name}" = $1`, [rowId]);
            if (oldDataResult.rows.length === 0) throw new Error(`Row with PK '${rowId}' not found.`);
            oldData = oldDataResult.rows[0];

            const ddl = `UPDATE "${schemaName}"."${safeTableName}" SET ${setClauses.join(', ')} WHERE "${pkCol.column_name}" = $${i} RETURNING *`;
            const result = await pool.query(ddl, params);
            updatedRow = result.rows[0];
        }

        const { invalidateTableCache } = await import('@/lib/cache');
        await invalidateTableCache(projectId, tableId);

        fireWebhooks(projectId, userId, tableId, 'row.updated', updatedRow, oldData).catch(err => {
            console.error(`[Webhook Fire Error] ${tableId} update:`, err);
        });
    } catch (error: any) {
        throw new Error(`Update failed: ${error.message}`);
    }
}

export async function deleteRow(projectId: string, tableId: string, rowId: string) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    const columns = await getColumnsForTable(projectId, tableId);
    const pkCol = columns.find(c => c.is_primary_key);

    if (!pkCol) {
        throw new Error("Table must have a Primary Key to delete specific rows natively.");
    }

    const safeTableName = tableId.replace(/[^a-zA-Z0-9_]/g, '');

    try {
        let oldData = null;

        if (project.dialect?.toLowerCase() === 'mysql') {
            const { getMysqlPool } = await import('@/lib/mysql');
            const mysqlPool = getMysqlPool();
            const dbName = `project_${projectId}`;

            const [oldDataResult]: any = await mysqlPool.query(`SELECT * FROM \`${dbName}\`.\`${safeTableName}\` WHERE \`${pkCol.column_name}\` = ?`, [rowId]);
            oldData = oldDataResult.length > 0 ? oldDataResult[0] : null;

            if (oldData) {
                await mysqlPool.query(`DELETE FROM \`${dbName}\`.\`${safeTableName}\` WHERE \`${pkCol.column_name}\` = ?`, [rowId]);
            }
        } else {
            const pool = getPgPool();
            const schemaName = `project_${projectId}`;

            // Fetch old data for webhook
            const oldDataResult = await pool.query(`SELECT * FROM "${schemaName}"."${safeTableName}" WHERE "${pkCol.column_name}"::text = $1`, [rowId]);
            oldData = oldDataResult.rows.length > 0 ? oldDataResult.rows[0] : null;

            if (oldData) {
                await pool.query(`DELETE FROM "${schemaName}"."${safeTableName}" WHERE "${pkCol.column_name}"::text = $1`, [rowId]);
            }
        }
        if (oldData) {
            const { invalidateTableCache } = await import('@/lib/cache');
            await invalidateTableCache(projectId, tableId);

            fireWebhooks(projectId, userId, tableId, 'row.deleted', undefined, oldData).catch(err => {
                console.error(`[Webhook Fire Error] ${tableId} delete:`, err);
            });
        }
    } catch (error: any) {
        throw new Error(`Deletion failed: ${error.message}`);
    }
}


// --- Analytics ---

export interface ProjectAnalytics {
    totalSize: number;
    totalRows: number;
    tables: { name: string; rows: number; size: number }[];
}

export async function getProjectAnalytics(projectId: string): Promise<ProjectAnalytics> {
    const userId = await getCurrentUserId();
    if (!userId) {
        return { totalSize: 0, totalRows: 0, tables: [] };
    }

    try {
        const project = await getProjectById(projectId, userId);
        const tables = await getTablesForProject(projectId, userId);

        const tableStatsPromises = tables.map(async (table) => {
            const safeTableName = table.table_name.replace(/[^a-zA-Z0-9_]/g, '');
            let rowCount = 0;

            if (project?.dialect?.toLowerCase() === 'mysql') {
                const { getMysqlPool } = await import('@/lib/mysql');
                const mysqlPool = getMysqlPool();
                const dbName = `project_${projectId}`;
                const [countResult]: any = await mysqlPool.query(`SELECT COUNT(*) as count FROM \`${dbName}\`.\`${safeTableName}\``);
                rowCount = parseInt(countResult[0].count);
            } else {
                const pool = getPgPool();
                const schemaName = `project_${projectId}`;
                const countResult = await pool.query(`SELECT COUNT(*) FROM "${schemaName}"."${safeTableName}"`);
                rowCount = parseInt(countResult.rows[0].count);
            }

            // Rough size estimation for UI purposes since precise sizes require deep catalog introspection
            const size = 1024 + (rowCount * 128);

            return {
                name: table.table_name,
                rows: rowCount,
                size: size
            };
        });

        const tablesStats = await Promise.all(tableStatsPromises);

        const totalRows = tablesStats.reduce((sum, stat) => sum + stat.rows, 0);
        const totalSize = tablesStats.reduce((sum, stat) => sum + stat.size, 0);

        return {
            totalRows,
            totalSize,
            tables: tablesStats
        };

    } catch (error) {
        console.error("Native Analytics error:", error);
        return { totalSize: 0, totalRows: 0, tables: [] };
    }
}

// --- Audit & Security ---

export async function logAuditAction(projectId: string, userId: string, action: string, statement: string, metadata: any = {}) {
    try {
        const pool = getPgPool();
        await pool.query(
            'INSERT INTO fluxbase_global.audit_logs (project_id, user_id, action, statement, metadata) VALUES ($1, $2, $3, $4, $5)',
            [projectId, userId, action, statement, JSON.stringify(metadata)]
        );
    } catch (e) {
        // Failing to log shouldn't necessarily crash the process, but needs tracking
        console.error("[AUDIT LOG FAILURE]", e);
    }
}
