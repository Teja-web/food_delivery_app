import { NextRequest, NextResponse } from "next/server";
import { getActionContext } from "@/lib/auth/context";
import { getEmailProvider, type EmailProvider } from "@/lib/integrations/email";
import "@/lib/integrations/register-providers";

export async function GET(request: NextRequest) {
  const ctx = await getActionContext();
  const provider = (request.nextUrl.searchParams.get("provider") ?? "google") as EmailProvider;
  const impl = getEmailProvider(provider);
  const url = await impl.getAuthUrl(ctx.userId, ctx.organizationId);
  return NextResponse.redirect(url);
}
