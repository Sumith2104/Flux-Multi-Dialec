"use server";

import { getPgPool } from "@/lib/pg";
import { createSessionCookie } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
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

    if (existing.rows.length > 0) {
      // User exists, just log them in
      userId = existing.rows[0].id;
    } else {
      // 2. New User - Auto Signup
      userId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO fluxbase_global.users (id, email, display_name, photo_url) 
                 VALUES ($1, $2, $3, $4)`,
        [userId, email, name, photoUrl]
      );

      // Send Welcome Email (async, non-blocking)
      sendEmail(
        email,
        "Welcome to Fluxbase via Google! 🚀",
        `<div style="font-family: sans-serif; color: #333;">
                    <h1>Welcome to Fluxbase, ${name}!</h1>
                    <p>We're thrilled to have you on board via Google SSO.</p>
                </div>`
      ).catch(console.error);
    }

    // 3. Create active session cookie securely
    await createSessionCookie(userId);
    return { success: true };

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
    // Create user natively in AWS Postgres
    const userId = crypto.randomUUID();
    const pool = getPgPool();

    // Check if email exists
    const existing = await pool.query('SELECT id FROM fluxbase_global.users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return { error: "Email already exists" };
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await pool.query(
      'INSERT INTO fluxbase_global.users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)',
      [userId, email, name, passwordHash]
    );

    await createSessionCookie(userId);

    // Send Welcome Email (async, non-blocking)
    sendEmail(
      email,
      "Welcome to Fluxbase! 🚀",
      `<div style="font-family: sans-serif; color: #333;">
          <h1>Welcome to Fluxbase, ${name || 'Explorer'}!</h1>
          <p>We're thrilled to have you on board.</p>
      </div>`
    ).catch(console.error);

    return { success: true };
  } catch (error: any) {
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

    await createSessionCookie(user.id);
    return { success: true };
  } catch (error: any) {
    console.error("Native Login Error:", error);
    return { error: "Authentication failed. Please try again." };
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
