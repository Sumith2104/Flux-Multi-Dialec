import net from 'net';
import { ERROR_CODES, FluxbaseError } from '@/lib/error-codes';

function isPrivateIpv4(hostname: string): boolean {
    const parts = hostname.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;

    const [a, b] = parts;
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        a === 169 && b === 254 ||
        a === 172 && b >= 16 && b <= 31 ||
        a === 192 && b === 168 ||
        a >= 224
    );
}

function isPrivateIpv6(hostname: string): boolean {
    const lower = hostname.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:');
}

export function validatePublicWebhookUrl(value: unknown): string {
    if (typeof value !== 'string') {
        throw new FluxbaseError('Webhook URL must be a string.', ERROR_CODES.BAD_REQUEST, 400);
    }

    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new FluxbaseError('Invalid webhook URL.', ERROR_CODES.BAD_REQUEST, 400);
    }

    if (!['https:', 'http:'].includes(parsed.protocol)) {
        throw new FluxbaseError('Webhook URL must use http or https.', ERROR_CODES.BAD_REQUEST, 400);
    }

    if (parsed.username || parsed.password) {
        throw new FluxbaseError('Webhook URL must not contain credentials.', ERROR_CODES.BAD_REQUEST, 400);
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        hostname === 'metadata.google.internal'
    ) {
        throw new FluxbaseError('Webhook URL host is not allowed.', ERROR_CODES.FORBIDDEN, 403);
    }

    const ipVersion = net.isIP(hostname);
    if ((ipVersion === 4 && isPrivateIpv4(hostname)) || (ipVersion === 6 && isPrivateIpv6(hostname))) {
        throw new FluxbaseError('Webhook URL host is not allowed.', ERROR_CODES.FORBIDDEN, 403);
    }

    return parsed.toString();
}
