import Razorpay from 'razorpay';
import crypto from 'crypto';

export const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'mock_key_id',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'mock_key_secret'
});

export function validateRazorpaySignature(body: string, signature: string, secret: string) {
    const expectedSignature = crypto.createHmac('sha256', secret)
        .update(body)
        .digest('hex');
    return expectedSignature === signature;
}
