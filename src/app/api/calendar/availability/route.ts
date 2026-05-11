import { NextRequest, NextResponse } from "next/server";
import { getActionContext } from "@/lib/auth/context";
import { getFreeBusy } from "@/lib/integrations/calendar";
import "@/lib/integrations/register-providers";

export async function GET(request: NextRequest) {
  await getActionContext(); // ensure authenticated

  const userIds = request.nextUrl.searchParams.get("userIds")?.split(",").filter(Boolean) ?? [];
  const timeMin = request.nextUrl.searchParams.get("timeMin");
  const timeMax = request.nextUrl.searchParams.get("timeMax");

  if (!userIds.length || !timeMin || !timeMax) {
    return NextResponse.json({ error: "Missing userIds, timeMin, or timeMax" }, { status: 400 });
  }

  try {
    const availability = await getFreeBusy(userIds, timeMin, timeMax);
    return NextResponse.json({ availability });
  } catch (error) {
    console.error("Failed to fetch calendar availability:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch calendar availability";
    return NextResponse.json(
      { error: message, availability: {} },
      { status: 500 }
    );
  }
}
