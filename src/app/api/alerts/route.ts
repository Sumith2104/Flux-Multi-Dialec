import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { CloudWatchClient, PutMetricAlarmCommand, DeleteAlarmsCommand } from "@aws-sdk/client-cloudwatch";
import { fromEnv } from "@aws-sdk/credential-providers";

const getCloudWatchClient = () => {
    return new CloudWatchClient({
        region: process.env.AWS_REGION || "ap-south-1",
        credentials: fromEnv(),
    });
};

export async function POST(request: Request) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { identifier, metric, threshold, snsTopicArn } = body;

        // Valid metrics: CPUUtilization, DatabaseConnections, FreeableMemory
        const validMetric = metric || 'CPUUtilization';

        if (!identifier || !threshold) {
            return NextResponse.json({ success: false, error: 'Missing required parameters (identifier, threshold)' }, { status: 400 });
        }

        const client = getCloudWatchClient();
        const alarmName = `Fluxbase-Alarm-${identifier}-${validMetric}`;

        const command = new PutMetricAlarmCommand({
            AlarmName: alarmName,
            ComparisonOperator: validMetric === 'FreeableMemory' ? 'LessThanThreshold' : 'GreaterThanThreshold',
            EvaluationPeriods: 1,
            MetricName: validMetric,
            Namespace: "AWS/RDS",
            Period: 300, // Look at 5-minute averages
            Statistic: "Average",
            Threshold: parseFloat(threshold),
            ActionsEnabled: !!snsTopicArn,
            AlarmActions: snsTopicArn ? [snsTopicArn] : [],
            AlarmDescription: `Auto-generated Alert Configuration for ${identifier}`,
            Dimensions: [{ Name: "DBInstanceIdentifier", Value: identifier }],
        });

        await client.send(command);

        return NextResponse.json({
            success: true,
            message: `Successfully provisioned CloudWatch Trigger for ${validMetric} at threshold ${threshold}`,
            alarmName
        });
    } catch (error: any) {
        console.error('[Alert API Error]', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const alarmName = searchParams.get('alarmName');

        if (!alarmName) {
            return NextResponse.json({ success: false, error: 'Missing alarmName parameter' }, { status: 400 });
        }

        const client = getCloudWatchClient();
        await client.send(new DeleteAlarmsCommand({
            AlarmNames: [alarmName]
        }));

        return NextResponse.json({ success: true, message: `Removed alarm ${alarmName} ` });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
