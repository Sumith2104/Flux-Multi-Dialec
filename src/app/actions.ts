"use server";

import { adminAuth } from "@/lib/firebase-admin";
import { sendEmail } from "@/lib/email";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

// In-memory store for demo purposes (replace with Redis/DB in production)
const otpStore = new Map<string, string>();

export async function signupAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;

  if (!email || !password || !name) {
    return { error: "Missing fields" };
  }

  try {
    // Create user in Firebase
    const user = await adminAuth.createUser({
      email,
      password,
      displayName: name,
    });

    // Generate OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    otpStore.set(user.uid, otp);

    // Send OTP email
    await sendEmail({
      to: email,
      subject: "Verify your email",
      html: `<p>Your verification code is: <strong>${otp}</strong></p>`,
    });

    return { success: true, userId: user.uid, otp }; // Returning OTP for demo
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function verifyOtpAction(formData: FormData) {
  const userId = formData.get("userId") as string;
  const otp = formData.get("otp") as string;

  if (!userId || !otp) {
    return { error: "Missing fields" };
  }

  const storedOtp = otpStore.get(userId);

  if (storedOtp !== otp) {
    return { error: "Invalid OTP" };
  }

  try {
    // Create session cookie
    const customToken = await adminAuth.createCustomToken(userId);

    // Note: In a real app we'd exchange customToken for session cookie via client SDK
    // or here if we use a different flow. For this demo, we'll set a simple cookie
    // or assume the client will handle the token.
    // However, the client code expects this action to handle "login".

    // Let's create a session cookie if using session management
    // For simplicity in this "actions" flow, let's just return success
    // and let the client redirect.

    // Mocking session set for now since we are server-side
    (await cookies()).set("session", "demo_session_" + userId, { httpOnly: true });

    otpStore.delete(userId);
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}
