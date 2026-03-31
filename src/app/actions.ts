"use server";

import { getPgPool } from "@/lib/pg";
import { createSessionCookie } from "@/lib/auth";
import { sendOtpEmail, sendWelcomeEmail } from "@/lib/email";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

export async function googleAuthAction(accessToken: string) {
  if (!accessToken) return { error: "No token provided" };

  try {
    // We use the access_token securely fetched by the frontend to get user info from Google APIs
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoResponse.ok) {
      return { error: "Failed to fetch user profile from Google" };
    }

    const payload = await userInfoResponse.json();
    if (!payload || !payload.email) {
      return { error: "Invalid Google payload" };
    }

    const email = payload.email;
    const name = payload.name || "Google User";
    const photoUrl = payload.picture || null;

    const pool = getPgPool();

    // 1. Check if user exists
    const existing = await pool.query('SELECT id FROM fluxbase_global.users WHERE email = $1', [email]);
    let userId = '';
    let isNewUser = false;

    if (existing.rows.length > 0) {
      // User exists, just log them in
      userId = existing.rows[0].id;
      if (photoUrl) {
          await pool.query('UPDATE fluxbase_global.users SET photo_url = $1 WHERE id = $2::text', [photoUrl, userId]);
      }
    } else {
      // 2. New User - Auto Signup
      isNewUser = true;
      userId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO fluxbase_global.users (id, email, display_name, photo_url) 
                 VALUES ($1::text, $2, $3, $4)`,
        [userId, email, name, photoUrl]
      );

      // Send beautiful consistent Welcome Email
      sendWelcomeEmail(email, name).catch(console.error);
    }

    // 3. Check for 2FA requirement
    const { rows: userSettings } = await pool.query(
      'SELECT two_factor_enabled FROM fluxbase_global.users WHERE id = $1::text',
      [userId]
    );

    if (userSettings[0]?.two_factor_enabled) {
      return { success: true, requires2FA: true, userId };
    }

    // 4. Create active session cookie securely
    await createSessionCookie(userId);
    return { success: true, isNewUser };

  } catch (error: any) {
    console.error("Google Auth Error:", error);
    return { error: "Authentication failed." };
  }
}

export async function signupAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;

  if (!email || !password || !name) {
    return { error: "Missing fields" };
  }

  try {
    const pool = getPgPool();

    // Check if email already exists in main users table
    const existing = await pool.query('SELECT id FROM fluxbase_global.users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return { error: "Email already exists" };
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60000); // 15 minutes

    // Upsert into isolated otp_verifications table
    await pool.query(`
      INSERT INTO fluxbase_global.otp_verifications (email, name, password_hash, otp_code, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        otp_code = EXCLUDED.otp_code,
        expires_at = EXCLUDED.expires_at
    `, [email, name, passwordHash, otp, expiresAt]);

    // Send OTP email asynchronously
    sendOtpEmail(email, name, otp).catch(console.error);

    return { success: true, requireOtp: true, email };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function verifyOtpAction(formData: FormData) {
  const email = formData.get("email") as string;
  const otp = formData.get("otp") as string;

  if (!email || !otp) {
    return { error: "Missing email or OTP" };
  }

  try {
    const pool = getPgPool();
    const pendingResult = await pool.query(
      'SELECT name, password_hash, otp_code, expires_at FROM fluxbase_global.otp_verifications WHERE email = $1',
      [email]
    );

    if (pendingResult.rows.length === 0) {
      return { error: "No pending verification found for this email. Please sign up again." };
    }

    const pendingUser = pendingResult.rows[0];

    if (pendingUser.otp_code !== otp) {
      return { error: "Invalid verification code." };
    }

    if (new Date() > new Date(pendingUser.expires_at)) {
      // Expired, clear it out.
      await pool.query('DELETE FROM fluxbase_global.otp_verifications WHERE email = $1', [email]);
      return { error: "Verification code has expired. Please sign up again." };
    }

    // OTP Valid! Create the real user from the pending hash
    const userId = crypto.randomUUID();
    await pool.query(
      'INSERT INTO fluxbase_global.users (id, email, display_name, password_hash) VALUES ($1::text, $2, $3, $4)',
      [userId, email, pendingUser.name, pendingUser.password_hash]
    );

    // Cleanup pending verification
    await pool.query('DELETE FROM fluxbase_global.otp_verifications WHERE email = $1', [email]);

    // Securely log them in
    await createSessionCookie(userId);

    // Send uniform Welcome Email for native registration
    sendWelcomeEmail(email, pendingUser.name).catch(console.error);

    return { success: true };
  } catch (error: any) {
    console.error("OTP Verification Error:", error);
    return { error: error.message };
  }
}

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Missing fields" };
  }

  try {
    const pool = getPgPool();
    const result = await pool.query('SELECT id, password_hash FROM fluxbase_global.users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return { error: "No account found with this email." };
    }

    const user = result.rows[0];

    if (!user.password_hash) {
      return { error: "Invalid account configuration (No password)." };
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return { error: "Invalid password." };
    }

    // Check for 2FA
    const { rows: userSettings } = await pool.query(
      'SELECT two_factor_enabled FROM fluxbase_global.users WHERE id = $1::text',
      [user.id]
    );

    if (userSettings[0]?.two_factor_enabled) {
      return { success: true, requires2FA: true, userId: user.id };
    }

    await createSessionCookie(user.id);
    return { success: true };
  } catch (error: any) {
    console.error("Native Login Error:", error);
    return { error: "Authentication failed. Please try again." };
  }
}

export async function verify2FALoginAction(userId: string, code: string) {
  if (!userId || !code) return { error: "Missing verification data" };

  try {
    const { getPgPool } = await import('@/lib/pg');
    const { verifyTOTPCode } = await import('@/lib/2fa');
    
    const pool = getPgPool();
    const { rows } = await pool.query(
      'SELECT two_factor_secret, two_factor_enabled FROM fluxbase_global.users WHERE id = $1::text',
      [userId]
    );

    const user = rows[0];
    if (!user || !user.two_factor_enabled || !user.two_factor_secret) {
      return { error: "2FA not properly configured for this user" };
    }

    if (verifyTOTPCode(user.two_factor_secret, code)) {
      await createSessionCookie(userId);
      return { success: true };
    } else {
      return { error: "Invalid verification code" };
    }
  } catch (error: any) {
    console.error("2FA Verification Error:", error);
    return { error: "Verification failed. Please try again." };
  }
}

export async function selectProjectAction(formData: FormData) {
  const project = formData.get("project") as string;
  if (project) {
    (await cookies()).set("selectedProject", project, { path: "/", httpOnly: false });
  } else {
    (await cookies()).set("selectedProject", "", { path: "/", maxAge: 0 });
  }
}

export async function resetPasswordAction(formData: FormData) {
  const email = formData.get("email") as string;
  const token = formData.get("token") as string;
  const password = formData.get("password") as string;

  if (!email || !token || !password) {
    return { error: "Missing required fields." };
  }

  try {
    const pool = getPgPool();
    const tokenResult = await pool.query(
      'SELECT expires_at FROM fluxbase_global.password_resets WHERE email = $1 AND token = $2',
      [email, token]
    );

    if (tokenResult.rows.length === 0) {
      return { error: "Invalid or consumed password reset link. Please generate a new one." };
    }

    const expiresAt = new Date(tokenResult.rows[0].expires_at);
    if (new Date() > expiresAt) {
      await pool.query('DELETE FROM fluxbase_global.password_resets WHERE email = $1', [email]);
      return { error: "Password reset link has expired. Please request a new one." };
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const userResult = await pool.query(
      'UPDATE fluxbase_global.users SET password_hash = $1 WHERE email = $2 RETURNING id',
      [passwordHash, email]
    );

    if (userResult.rows.length === 0) {
      return { error: "User not found. Identity verification failed." };
    }

    // Successfully updated to new password! Clear out the single-use token.
    await pool.query('DELETE FROM fluxbase_global.password_resets WHERE email = $1', [email]);

    // Auto-login flawlessly after the password reset
    const userId = userResult.rows[0].id;
    await createSessionCookie(userId);

    return { success: true };
  } catch (error: any) {
    console.error("Password Reset Confirmation Error:", error);
    return { error: "Failed to reset password. Please try again later." };
  }
}
