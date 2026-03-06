import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { CloudWatchClient, GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { fromEnv } from "@aws-sdk/credential-providers";

const getCloudWatchClient = () => {
    return new CloudWatchClient({
        region: process.env.AWS_REGION || "ap-south-1",
        credentials: fromEnv(),
    });
};

export async function GET(request: Request) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const identifier = searchParams.get('identifier');
        const metricName = searchParams.get('metric') || 'CPUUtilization'; // CPUUtilization, DatabaseConnections, FreeableMemory
        const periodParam = searchParams.get('period') || '60'; // in minutes
        const minutes = parseInt(periodParam, 10);

        if (!identifier) {
            return NextResponse.json({ success: false, error: 'Missing instance identifier' }, { status: 400 });
        }

        const client = getCloudWatchClient();
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - minutes * 60 * 1000);

        const command = new GetMetricStatisticsCommand({
            Namespace: "AWS/RDS",
            MetricName: metricName,
            Dimensions: [
                { Name: "DBInstanceIdentifier", Value: identifier }
            ],
            StartTime: startTime,
            EndTime: endTime,
            Period: Math.max(60, Math.floor((minutes * 60) / 60)), // ~60 data points resolution
            Statistics: ["Average"]
        });

        const response = await client.send(command);

        // Sort chronological
        const datapoints = (response.Datapoints || []).sort((a, b) =>
            (a.Timestamp?.getTime() || 0) - (b.Timestamp?.getTime() || 0)
        );

        return NextResponse.json({
            success: true,
            metric: metricName,
            resolution_seconds: command.input.Period,
            data: datapoints.map(dp => ({
                timestamp: dp.Timestamp?.toISOString(),
                value: dp.Average,
                unit: dp.Unit
            }))
        });

    } catch (error: any) {
        console.error('[CloudWatch API Error]', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
