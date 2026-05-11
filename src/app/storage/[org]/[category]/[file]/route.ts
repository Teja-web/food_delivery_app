import { NextResponse } from "next/server";
import { extname } from "path";
import { getActionContext } from "@/lib/auth/context";
import { readFile } from "@/lib/storage";

/**
 * Org-scoped file serving for resumes and other uploaded artifacts.
 *
 * URL shape: /storage/<organizationId>/<category>/<filename>
 * (matches what `storeFile()` in lib/storage returns as `stored.url`)
 *
 * Auth: caller must be authenticated AND belong to the same org as the file.
 */

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ org: string; category: string; file: string }> },
) {
  const { org, category, file } = await params;

  const ctx = await getActionContext();
  if (ctx.organizationId !== org) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const buf = await readFile(org, category, file);
    const ext = extname(file).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${file}"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Not found";
    return new NextResponse(msg, { status: 404 });
  }
}
