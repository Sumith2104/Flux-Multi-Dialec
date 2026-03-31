import crypto from 'crypto';
import base32Encode from 'base32-encode';
import base32Decode from 'base32-decode';

/**
 * Basic TOTP (Time-based One-Time Password) implementation using native crypto.
 * Follows RFC 6238 and RFC 4648 for Base32.
 */

export function generateSecret() {
    // Standard TOTP secrets are typically 20 bytes random
    const buffer = crypto.randomBytes(20);
    // Encode to Base32 RFC4648 alphabet
    return base32Encode(buffer, 'RFC4648').replace(/=/g, '');
}

export function getTOTPCode(secret: string, window = 0) {
    const counter = Math.floor(Date.now() / 30000) + window;
    
    // Standard apps expect secrets to be Base32
    let bSecret: Buffer;
    try {
        bSecret = Buffer.from(base32Decode(secret, 'RFC4648'));
    } catch (e) {
        // Fallback for any old hex secrets if they still exist (migration period)
        bSecret = Buffer.from(secret, 'hex');
    }

    // Convert counter to 8-byte buffer
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter));

    const hmac = crypto.createHmac('sha1', bSecret);
    hmac.update(buf);
    const h = hmac.digest();

    const offset = h[h.length - 1] & 0x0f;
    const code = (
        ((h[offset] & 0x7f) << 24) |
        ((h[offset + 1] & 0xff) << 16) |
        ((h[offset + 2] & 0xff) << 8) |
        (h[offset + 3] & 0xff)
    ) % 1000000;

    return code.toString().padStart(6, '0');
}

export function verifyTOTPCode(secret: string, code: string) {
    // Allow a window of +/- 1 (30 seconds) to account for clock drift
    for (let i = -1; i <= 1; i++) {
        if (getTOTPCode(secret, i) === code) {
            return true;
        }
    }
    return false;
}

export function getQRCodeUrl(email: string, secret: string) {
    const issuer = 'Fluxbase';
    // Remove padding for URL as some apps prefer it that way
    const cleanSecret = secret.replace(/=/g, '');
    return `otpauth://totp/${issuer}:${email}?secret=${cleanSecret}&issuer=${issuer}`;
}
