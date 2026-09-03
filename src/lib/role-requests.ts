import { getPgPool } from '@/lib/pg';
import { sendEmail } from '@/lib/email';
import logger from '@/lib/logger';

export interface RoleRequestData {
  userId: string;
  userEmail?: string;
  role: 'employee' | 'org_owner';
  companyName: string;
  workDescription: string;
  projectName: string;
  dialect: string;
  billingPreference?: 'monthly' | 'pay_as_you_go' | 'hybrid';
}

export async function submitRoleRequest(data: RoleRequestData) {
  const pool = getPgPool();

  try {
    // 1. Ensure table exists with billing columns
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fluxbase_global.role_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(128) NOT NULL,
        user_email VARCHAR(255),
        role_requested VARCHAR(50) NOT NULL,
        company_name VARCHAR(255),
        work_description TEXT,
        project_name VARCHAR(255),
        dialect VARCHAR(50),
        billing_preference VARCHAR(50) DEFAULT 'monthly',
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure billing_preference column exists if table was already created
    try {
      await pool.query('ALTER TABLE fluxbase_global.role_requests ADD COLUMN IF NOT EXISTS billing_preference VARCHAR(50) DEFAULT \'monthly\'');
    } catch {}

    // 2. Insert record
    const insertRes = await pool.query(`
      INSERT INTO fluxbase_global.role_requests (
        user_id, user_email, role_requested, company_name, work_description, project_name, dialect, billing_preference
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, created_at
    `, [
      data.userId,
      data.userEmail || null,
      data.role,
      data.companyName || null,
      data.workDescription || null,
      data.projectName,
      data.dialect,
      data.billingPreference || 'monthly'
    ]);

    const requestId = insertRes.rows[0]?.id;

    // 3. Send email to admin
    const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'sumithu.dev@gmail.com';
    const roleDisplay = data.role === 'org_owner' ? 'Organization Owner (Top-Grade Enterprise)' : 'Employee (High-Performance)';
    const priceDisplay = data.role === 'org_owner' ? '₹5,000 / month (Top-Grade 8 vCPU, 32GB RAM, 100GB NVMe)' : '₹500 / month (High-Performance 2 vCPU, 4GB RAM, 10GB SSD)';

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #090d16; color: #f8fafc; padding: 28px; border-radius: 12px; border: 1px solid #1e293b; max-width: 600px; margin: 0 auto;">
        <div style="border-bottom: 1px solid #1e293b; padding-bottom: 16px; margin-bottom: 20px;">
          <span style="font-size: 11px; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; color: #38bdf8;">Fluxbase Dedicated Server Request</span>
          <h2 style="color: #ffffff; margin: 6px 0 0 0; font-size: 20px;">New ${roleDisplay}</h2>
        </div>

        <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1; margin-bottom: 20px;">
          A user has requested provisioning for a dedicated high-performance server tier.
        </p>

        <div style="background: #0f172a; border-radius: 8px; border: 1px solid #334155; padding: 16px; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr style="border-bottom: 1px solid #1e293b;">
              <td style="padding: 10px 0; color: #94a3b8; font-weight: 600; width: 140px;">User ID</td>
              <td style="padding: 10px 0; color: #f8fafc; font-family: monospace;">${data.userId}</td>
            </tr>
            <tr style="border-bottom: 1px solid #1e293b;">
              <td style="padding: 10px 0; color: #94a3b8; font-weight: 600;">Email Address</td>
              <td style="padding: 10px 0; color: #f8fafc;">${data.userEmail || 'N/A'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #1e293b;">
              <td style="padding: 10px 0; color: #94a3b8; font-weight: 600;">Role & Tier</td>
              <td style="padding: 10px 0; color: #38bdf8; font-weight: bold;">${roleDisplay}</td>
            </tr>
            <tr style="border-bottom: 1px solid #1e293b;">
              <td style="padding: 10px 0; color: #94a3b8; font-weight: 600;">Tier Pricing</td>
              <td style="padding: 10px 0; color: #4ade80; font-weight: 600;">${priceDisplay}</td>
            </tr>
            <tr style="border-bottom: 1px solid #1e293b;">
              <td style="padding: 10px 0; color: #94a3b8; font-weight: 600;">Billing Model</td>
              <td style="padding: 10px 0; color: #f8fafc; text-transform: capitalize;">${(data.billingPreference || 'monthly').replace(/_/g, ' ')}</td>
            </tr>
            <tr style="border-bottom: 1px solid #1e293b;">
              <td style="padding: 10px 0; color: #94a3b8; font-weight: 600;">Company / Org</td>
              <td style="padding: 10px 0; color: #f8fafc;">${data.companyName || 'N/A'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #1e293b;">
              <td style="padding: 10px 0; color: #94a3b8; font-weight: 600;">Target Project</td>
              <td style="padding: 10px 0; color: #f8fafc;">${data.projectName} (${data.dialect.toUpperCase()})</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #94a3b8; font-weight: 600; vertical-align: top;">What They Do</td>
              <td style="padding: 10px 0; color: #f8fafc; line-height: 1.5;">${data.workDescription || 'No description provided'}</td>
            </tr>
          </table>
        </div>

        <div style="font-size: 11px; color: #64748b; border-top: 1px solid #1e293b; pt: 16px;">
          Request ID: <span style="font-family: monospace; color: #94a3b8;">${requestId}</span>
        </div>
      </div>
    `;

    try {
      await sendEmail(
        adminEmail,
        `[Fluxbase Tier Request] ${roleDisplay} from ${data.userEmail || data.userId}`,
        html
      );
      logger.info(`[Role Request] Sent notification email to ${adminEmail} for user ${data.userId}`);
    } catch (emailErr) {
      logger.error('[Role Request] Failed to send admin notification email:', emailErr);
    }

    return { success: true, requestId };
  } catch (error: any) {
    logger.error('[Role Request] Error submitting role request:', error);
    return { success: false, error: error.message };
  }
}
