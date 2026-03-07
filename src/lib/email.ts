import nodemailer from 'nodemailer';
import path from 'path';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export async function sendEmail(to: string, subject: string, html: string, attachments?: any[]) {
    if (!process.env.SMTP_HOST) {
        console.log("SMTP not configured. Skipping email:", { to, subject });
        return;
    }

    try {
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Fluxbase" <noreply@fluxbase.com>',
            to,
            subject,
            html,
            attachments,
        });
        console.log("Message sent: %s", info.messageId);
        return info;
    } catch (error) {
        console.error("Error sending email:", error);
        throw error;
    }
}

interface EmailTemplateOptions {
    title: string;
    greeting: string;
    instruction: string;
    contentHtml?: string;
}

function buildEmailHtml(options: EmailTemplateOptions) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${options.title}</title>
        <style>
            /* Reset & Base Styles */
            body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
            table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
            img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; display: block; }
            body { margin: 0; padding: 0; width: 100% !important; background-color: #000000; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
            
            /* Typography & Layout */
            .wrapper { width: 100%; background-color: #000000; padding: 40px 0; }
            .content-table { max-width: 600px; width: 100%; margin: 0 auto; background-color: #09090b; border: 1px solid #27272a; border-radius: 24px; overflow: hidden; }
            
            /* Header */
            .header { padding: 48px 40px 32px 40px; text-align: left; }
            .brand-logo { width: 48px; height: 48px; object-fit: contain; border-radius: 12px; background-color: rgba(255, 130, 36, 0.1); padding: 10px; box-sizing: border-box; }
            
            /* Body */
            .body-content { padding: 0 40px; text-align: left; }
            h1 { margin: 0 0 16px 0; font-size: 28px; font-weight: 700; color: #ffffff; line-height: 1.3; font-family: -apple-system, sans-serif; letter-spacing: -0.5px; margin-top: 0; }
            p.greeting { font-size: 18px; color: #e4e4e7; margin: 0 0 24px 0; line-height: 1.6; }
            p.instruction { font-size: 16px; color: #a1a1aa; margin: 0 0 40px 0; line-height: 1.6; }
            
            /* Custom Content Box */
            .custom-wrapper { padding: 0 40px 48px 40px; }
            .custom-box { background: linear-gradient(145deg, rgba(255,130,36,0.1) 0%, rgba(255,130,36,0.02) 100%); border: 1px solid rgba(255, 130, 36, 0.2); border-radius: 16px; padding: 32px; text-align: center; }
            
            /* Button */
            .btn { display: inline-block; background-color: #ff8224; color: #ffffff !important; font-size: 16px; font-weight: 600; text-decoration: none; padding: 16px 32px; border-radius: 8px; letter-spacing: 0.5px; transition: background-color 0.2s; }
            .btn:hover { background-color: #e67520; }

            /* Footer */
            .footer { padding: 32px 40px 40px 40px; background-color: #050505; border-top: 1px solid #18181b; text-align: left; }
            .footer-info { font-size: 14px; color: #71717a; margin: 0 0 16px 0; line-height: 1.5; }
            .footer-legal { font-size: 13px; color: #52525b; margin: 0; }
            
            /* Mobile Adjustments */
            @media screen and (max-width: 600px) {
                .content-table { border-radius: 0; border: none; }
                .header, .body-content, .custom-wrapper, .footer { padding-left: 24px; padding-right: 24px; }
            }
            ${options.contentHtml?.includes('otp-code') ? `
            .otp-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 2.5px; color: #ff8224; margin: 0 0 16px 0; }
            .otp-code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; font-size: 48px; font-weight: 800; letter-spacing: 12px; color: #ffffff; margin: 0; text-shadow: 0 0 20px rgba(255,130,36,0.3); }
            @media screen and (max-width: 600px) { .otp-code { font-size: 36px; letter-spacing: 8px; } }
            ` : ''}
        </style>
    </head>
    <body leftmargin="0" marginwidth="0" topmargin="0" marginheight="0" offset="0">
        <table align="center" border="0" cellpadding="0" cellspacing="0" class="wrapper">
            <tr>
                <td align="center" valign="top">
                    <!-- Main Content Table -->
                    <table border="0" cellpadding="0" cellspacing="0" class="content-table">
                        
                        <!-- Header -->
                        <tr>
                            <td class="header">
                                <img src="cid:fluxbase-favicon" alt="Fluxbase" class="brand-logo" width="48" height="48" style="display:block;" />
                            </td>
                        </tr>
                        
                        <!-- Body Text -->
                        <tr>
                            <td class="body-content">
                                <h1>${options.title}</h1>
                                <p class="greeting">${options.greeting}</p>
                                <p class="instruction">${options.instruction}</p>
                            </td>
                        </tr>
                        
                        <!-- Custom Display (OTP / Button) -->
                        ${options.contentHtml ? `
                        <tr>
                            <td class="custom-wrapper">
                                <div class="custom-box">
                                    ${options.contentHtml}
                                </div>
                            </td>
                        </tr>` : ''}
                        
                        <!-- Footer -->
                        <tr>
                            <td class="footer">
                                <p class="footer-info">This is an automated message from Fluxbase. For security reasons, do not share sensitive links or codes with anyone. If you did not initiate this request, you can safely ignore this email.</p>
                                <p class="footer-legal">&copy; ${new Date().getFullYear()} Fluxbase Inc. &bull; Secure Systems</p>
                            </td>
                        </tr>
                        
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
}

// Get the central CID attachments universally required for all branded emails
function getBrandAttachments() {
    return [{
        filename: 'favicon.png', // Sent as PNG to ensure email client rendering compatibility
        path: path.join(process.cwd(), 'src/app/favicon.ico'),
        cid: 'fluxbase-favicon'
    }];
}

export async function sendOtpEmail(to: string, name: string, otp: string) {
    const safeName = name || 'Developer';
    const html = buildEmailHtml({
        title: "Secure Verification",
        greeting: "Hello " + safeName + ",",
        instruction: "We received a request to authorize a new device for your Fluxbase account. To proceed, please use the secure verification code below.",
        contentHtml: '<p class="otp-label">Authentication Code</p><p class="otp-code">' + otp + '</p>'
    });

    return sendEmail(to, otp + " is your Fluxbase verification code", html, getBrandAttachments());
}

export async function sendWelcomeEmail(to: string, name: string) {
    const safeName = name || 'Explorer';
    const url = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const html = buildEmailHtml({
        title: "Welcome to Fluxbase 🚀",
        greeting: "Hello " + safeName + ",",
        instruction: "We're absolutely thrilled to have you on board! You're now ready to start accelerating your workflows with the most powerful native database tools available.",
        contentHtml: '<a href="' + url + '/dashboard" class="btn">Open Dashboard</a>'
    });

    return sendEmail(to, "Welcome to Fluxbase! 🚀", html, getBrandAttachments());
}

export async function sendPasswordResetEmail(to: string, resetLink: string) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const html = buildEmailHtml({
        title: "Reset Your Password",
        greeting: "Hello,",
        instruction: "We received a request to reset the password for your Fluxbase account. Please click the secure link below to proceed.",
        contentHtml: `
            <div style="margin-bottom: 24px;">
                <a href="${resetLink}" class="btn">Reset Password</a>
            </div>
            <p style="color: #a1a1aa; font-size: 14px; margin: 0 0 16px 0;">If you remembered your password, you can simply log in instead:</p>
            <div>
                <a href="${baseUrl}" class="btn" style="background-color: transparent; border: 1px solid #52525b; color: #e4e4e7 !important;">Login to Fluxbase</a>
            </div>
        `
    });

    return sendEmail(to, "Fluxbase Password Reset", html, getBrandAttachments());
}

export async function sendLoginAlertEmail(to: string, name: string) {
    const safeName = name || 'Explorer';
    const url = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const html = buildEmailHtml({
        title: "New Login Detected",
        greeting: "Hello " + safeName + ",",
        instruction: "We detected a new login to your Fluxbase account. If this was you, no further action is required.",
        contentHtml: '<p style="color: #a1a1aa; font-size: 14px; margin:0;">If you did not authorize this login, please <a href="' + url + '/settings" style="color: #ff8224; text-decoration: underline;">reset your password</a> immediately.</p>'
    });

    return sendEmail(to, "New login to your Fluxbase account", html, getBrandAttachments());
}
