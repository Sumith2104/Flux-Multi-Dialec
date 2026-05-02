import Razorpay from 'razorpay';
import crypto from 'crypto';

function getRequiredEnv(name: string, devFallback: string): string {
    const value = process.env[name];
    if (value) return value;

    if (process.env.NODE_ENV === 'production') {
        throw new Error(`Missing required ${name} environment variable`);
    }
    return devFallback;
}

export function getRazorpayClient() {
    return new Razorpay({
        key_id: getRequiredEnv('RAZORPAY_KEY_ID', 'mock_key_id'),
        key_secret: getRequiredEnv('RAZORPAY_KEY_SECRET', 'mock_key_secret')
    });
}

export function getRazorpayWebhookSecret(): string {
    return getRequiredEnv('RAZORPAY_WEBHOOK_SECRET', 'test_secret');
}

export function validateRazorpaySignature(body: string, signature: string, secret: string) {
    const expectedSignature = crypto.createHmac('sha256', secret)
        .update(body)
        .digest('hex');
    return expectedSignature === signature;
}
