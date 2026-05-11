import { NextRequest, NextResponse } from "next/server";
import { getActionContext } from "@/lib/auth/context";
import { getATSProvider, type ATSProvider } from "@/lib/integrations/ats";
import "@/lib/integrations/register-providers";

export async function GET(request: NextRequest) {
  const ctx = await getActionContext();
  const provider = request.nextUrl.searchParams.get("provider") as ATSProvider;
  if (!provider) {
    return NextResponse.redirect(
      new URL("/recruit/settings/integrations?error=missing_params", request.url)
    );
  }

  const impl = getATSProvider(provider);
  const url = await impl.getAuthUrl(ctx.organizationId);

  // If it's a relative URL (API key providers), redirect to settings
  if (url.startsWith("/")) {
    return NextResponse.redirect(new URL(url, request.url));
  }

  return NextResponse.redirect(url);
}
