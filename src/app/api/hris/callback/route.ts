import { NextRequest, NextResponse } from "next/server";
import { getHRISProvider, type HRISProvider } from "@/lib/integrations/hris";
import "@/lib/integrations/register-providers";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/recruit/settings/integrations?error=missing_params", request.url)
    );
  }

  try {
    const stateData = JSON.parse(Buffer.from(state, "base64").toString());
    const { orgId, provider } = stateData as { orgId: string; provider: HRISProvider };

    const impl = getHRISProvider(provider);
    await impl.exchangeCodeForTokens(code, orgId);

    return NextResponse.redirect(
      new URL("/recruit/settings/integrations?hris_connected=true", request.url)
    );
  } catch {
    return NextResponse.redirect(
      new URL("/recruit/settings/integrations?error=auth_failed", request.url)
    );
  }
}
