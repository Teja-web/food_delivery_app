import { NextRequest, NextResponse } from "next/server";
import { getEmailProvider, type EmailProvider } from "@/lib/integrations/email";
import { decrypt } from "@/lib/integrations/encryption";
import "@/lib/integrations/register-providers";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3029";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(`${BASE_URL}/recruit/settings/integrations?error=missing_params`);
  }

  try {
    const { userId, orgId, provider: providerName } = JSON.parse(decrypt(state));
    const provider = (providerName ?? "google") as EmailProvider;
    const impl = getEmailProvider(provider);
    await impl.exchangeCodeForTokens(code, userId, orgId);
    return NextResponse.redirect(`${BASE_URL}/recruit/settings/integrations?email_connected=true`);
  } catch (error) {
    console.error("Email OAuth callback error:", error);
    return NextResponse.redirect(`${BASE_URL}/recruit/settings/integrations?error=email_auth_failed`);
  }
}
