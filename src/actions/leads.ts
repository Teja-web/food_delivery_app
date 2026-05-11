"use server";

import { createGmailAPITransporter } from "@/lib/email/gmail-api";

interface LeadData {
  name: string;
  email: string;
  company: string;
  teamSize: string;
  needs: string;
  recaptchaToken?: string;
}

async function verifyRecaptcha(token: string): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true; // Skip verification if not configured

  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
  });

  const data = await res.json();
  return data.success && data.score >= 0.5;
}

export async function submitLead(data: LeadData): Promise<{ ok: boolean; error?: string }> {
  const { name, email, company, teamSize, needs, recaptchaToken } = data;

  if (!name || !email || !company) {
    return { ok: false, error: "Missing required fields" };
  }

  // Verify reCAPTCHA if token provided and secret configured
  if (recaptchaToken) {
    const valid = await verifyRecaptcha(recaptchaToken);
    if (!valid) {
      return { ok: false, error: "Verification failed. Please try again." };
    }
  } else if (process.env.RECAPTCHA_SECRET_KEY) {
    return { ok: false, error: "Verification required." };
  }

  try {
    const transporter = createGmailAPITransporter();
    const notifyTo = process.env.GMAIL_USER || "";

    await transporter.sendMail({
      from: notifyTo,
      to: notifyTo,
      subject: `New lead: ${company} — ${name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px;">
          <h2 style="margin: 0 0 16px;">New Get Started Request</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; width: 120px;">Name</td>
              <td style="padding: 8px 0; font-weight: 500;">${escapeHtml(name)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Email</td>
              <td style="padding: 8px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Company</td>
              <td style="padding: 8px 0; font-weight: 500;">${escapeHtml(company)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Team size</td>
              <td style="padding: 8px 0;">${escapeHtml(teamSize || "Not specified")}</td>
            </tr>
          </table>
          ${needs ? `
            <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 6px;">
              <div style="color: #64748b; font-size: 13px; margin-bottom: 4px;">What they're looking for</div>
              <div>${escapeHtml(needs)}</div>
            </div>
          ` : ""}
        </div>
      `,
    });

    return { ok: true };
  } catch (error) {
    console.error("Lead form error:", error);
    return { ok: false, error: "Failed to submit" };
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
