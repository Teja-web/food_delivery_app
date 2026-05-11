import { NextRequest, NextResponse } from "next/server";
import { getActionContext } from "@/lib/auth/context";
import { getHRISProvider, type HRISProvider } from "@/lib/integrations/hris";
import "@/lib/integrations/register-providers";

export async function GET(request: NextRequest) {
  const ctx = await getActionContext();
  const provider = request.nextUrl.searchParams.get("provider") as HRISProvider;
  if (!provider) {
    return NextResponse.redirect(
      new URL("/recruit/settings/integrations?error=missing_params", request.url)
    );
  }

  const impl = getHRISProvider(provider);
  const url = await impl.getAuthUrl(ctx.organizationId);

  if (url.startsWith("/")) {
    return NextResponse.redirect(new URL(url, request.url));
  }

  return NextResponse.redirect(url);
}
