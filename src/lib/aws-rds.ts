import { RDSClient, CreateDBInstanceCommand, DescribeDBInstancesCommand, DeleteDBInstanceCommand, CreateDBSnapshotCommand, DescribeDBSnapshotsCommand } from "@aws-sdk/client-rds";
import { fromEnv } from "@aws-sdk/credential-providers";

// Initialize the RDS client using Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)
const getRdsClient = () => {
    return new RDSClient({
        region: process.env.AWS_REGION || "ap-south-1", // Match the current db region as fallback
        credentials: fromEnv(),
    });
};

export interface ProvisionDBConfig {
    instanceIdentifier: string;
    engine: 'postgres' | 'mysql';
    masterUsername: string;
    masterPassword: string;
    allocatedStorage?: number;
    instanceClass?: string;
}

/**
 * Orchestrates the creation of a new, completely isolated RDS database instance via AWS APIs.
 */
export async function provisionDatabaseInstance(config: ProvisionDBConfig) {
    const client = getRdsClient();

    const params = {
        DBInstanceIdentifier: config.instanceIdentifier,
        Engine: config.engine,
        MasterUsername: config.masterUsername,
        MasterUserPassword: config.masterPassword,
        DBInstanceClass: config.instanceClass || "db.t3.micro",
        AllocatedStorage: config.allocatedStorage || 20,
        PubliclyAccessible: true, // Needs to be public for Fluxbase to connect if running outside VPC
        BackupRetentionPeriod: 7, // Baseline automated backups
        StorageEncrypted: true,
        MultiAZ: false, // Baseline: false. Production sets to true.
        AutoMinorVersionUpgrade: true,
    };

    try {
        const command = new CreateDBInstanceCommand(params);
        const response = await client.send(command);
        console.log(`[AWS RDS] Provisioning started for ${config.instanceIdentifier}`);
        return response.DBInstance;
    } catch (error) {
        console.error(`[AWS RDS Error] Failed to provision instance ${config.instanceIdentifier}:`, error);
        throw error;
    }
}

/**
 * Fetches the current deployment status and endpoint for a transitioning DB Instance.
 */
export async function getDatabaseStatus(instanceIdentifier: string) {
    const client = getRdsClient();

    try {
        const command = new DescribeDBInstancesCommand({
            DBInstanceIdentifier: instanceIdentifier
        });
        const response = await client.send(command);
        if (response.DBInstances && response.DBInstances.length > 0) {
            const instance = response.DBInstances[0];
            return {
                status: instance.DBInstanceStatus, // 'creating', 'available', 'failed', etc.
                endpoint: instance.Endpoint?.Address,
                port: instance.Endpoint?.Port
            };
        }
        return null;
    } catch (error) {
        console.error(`[AWS RDS Error] Failed to fetch status for ${instanceIdentifier}:`, error);
        throw error;
    }
}

/**
 * Destroys an RDS Database Instance gracefully completely removing it.
 */
export async function terminateDatabaseInstance(instanceIdentifier: string, skipFinalSnapshot: boolean = true) {
    const client = getRdsClient();

    const params = {
        DBInstanceIdentifier: instanceIdentifier,
        SkipFinalSnapshot: skipFinalSnapshot,
        FinalDBSnapshotIdentifier: skipFinalSnapshot ? undefined : `${instanceIdentifier}-final-snapshot-${Date.now()}`
    };

    try {
        const command = new DeleteDBInstanceCommand(params);
        const response = await client.send(command);
        console.log(`[AWS RDS] Terminating instance ${instanceIdentifier}`);
        return response.DBInstance;
    } catch (error) {
        console.error(`[AWS RDS Error] Failed to terminate instance ${instanceIdentifier}:`, error);
        throw error;
    }
}
