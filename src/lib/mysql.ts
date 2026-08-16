import mysql from 'mysql2/promise';

const globalForMysql = globalThis as unknown as {
    mysqlPool: mysql.Pool | undefined;
};

export function getMysqlPool(): mysql.Pool {
    if (!globalForMysql.mysqlPool) {
        const rawUrl = process.env.AWS_RDS_MYSQL_URL || process.env.MYSQL_URL || process.env.DATABASE_MYSQL_URL;
        if (!rawUrl) {
            throw new Error("Missing AWS_RDS_MYSQL_URL environment variable");
        }

        // Strip the trailing database name (e.g., /fluxbase) from the URI
        // AWS RDS MySQL connections should be globally scoped.
        const parsedUrl = new URL(rawUrl);
        parsedUrl.pathname = '';

        // connectionLimit 20 to match pg max
        const pool = mysql.createPool({
            uri: parsedUrl.toString(),
            connectionLimit: 20,
            waitForConnections: true,
            queueLimit: 0,
            multipleStatements: false,
            enableKeepAlive: true, // Prevent AWS RDS from dropping idle connections
            keepAliveInitialDelay: 10000,
            ssl: {
                rejectUnauthorized: false
            } // Essential for AWS RDS
        });

        if (typeof process !== 'undefined') {
            const handleShutdown = async () => {
                try {
                    await pool.end();
                } catch {}
            };
            process.once('SIGTERM', handleShutdown);
            process.once('SIGINT', handleShutdown);
        }

        globalForMysql.mysqlPool = pool;
    }
    return globalForMysql.mysqlPool;
}
