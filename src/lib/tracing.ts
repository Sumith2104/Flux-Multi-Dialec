import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK.
 * Call once at app startup (e.g. in instrumentation.ts for Next.js).
 *
 * Set OTEL_EXPORTER_OTLP_ENDPOINT to point to your collector (e.g. Honeycomb, Grafana Tempo).
 * Set OTEL_EXPORTER_OTLP_HEADERS for auth headers if needed.
 */
export function initTracing(): void {
    if (sdk) return;
    if (process.env.NEXT_RUNTIME === 'edge') return;

    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (!otlpEndpoint) return;

    sdk = new NodeSDK({
        resource: resourceFromAttributes({
            [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'fluxbase',
            [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.1.0',
        }),
        traceExporter: new OTLPTraceExporter({}),
        instrumentations: [
            getNodeAutoInstrumentations({
                '@opentelemetry/instrumentation-fs': { enabled: false },
            }),
        ],
    });

    sdk.start();
}

export async function shutdownTracing(): Promise<void> {
    if (sdk) {
        try { await sdk.shutdown(); } catch {}
        sdk = null;
    }
}

export function isTracingEnabled(): boolean {
    return sdk !== null;
}
