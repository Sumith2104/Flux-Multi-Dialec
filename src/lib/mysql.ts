import mysql from 'mysql2/promise';

const globalForMysql = globalThis as unknown as {
    mysqlPool: mysql.Pool | undefined;
};

export function getMysqlPool(): mysql.Pool {
    if (!globalForMysql.mysqlPool) {
        if (!process.env.AWS_RDS_MYSQL_URL) {
            throw new Error("Missing AWS_RDS_MYSQL_URL environment variable");
        }

        // Strip the trailing database name (e.g., /fluxbase) from the URI
        // AWS RDS MySQL connections should be globally scoped.
        const parsedUrl = new URL(process.env.AWS_RDS_MYSQL_URL);
        parsedUrl.pathname = '';

        // connectionLimit 20 to match pg max
        globalForMysql.mysqlPool = mysql.createPool({
            uri: parsedUrl.toString(),
            connectionLimit: 20,
            waitForConnections: true,
            queueLimit: 0,
            multipleStatements: true, // Allow batch execution of scripts
            enableKeepAlive: true, // Prevent AWS RDS from dropping idle connections
            keepAliveInitialDelay: 10000,
            ssl: {
                rejectUnauthorized: false
            } // Essential for AWS RDS
        });
    }
    return globalForMysql.mysqlPool;
}
