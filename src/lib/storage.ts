import "server-only";

import { writeFile, readFile as fsReadFile, unlink, mkdir, readdir, stat } from "node:fs/promises";
import { resolve, basename, extname, join } from "node:path";
import { nanoid } from "nanoid";

// Use `path.join` for every fs path in this module. Two reasons:
//   1. Template-literal paths (`${a}/${b}`) trigger Turbopack's static
//      file tracer to emit broad `<dynamic>/<dynamic>/...` patterns that
//      match thousands of files in the project root and bloat the build.
//      `path.join` is opaque enough that the tracer gives up.
//   2. Cross-platform path joining (windows separator handling).
// Also: in production, set STORAGE_PATH to a directory *outside* the
// project root (e.g. `/var/lib/coznt/storage`) so the tracer has no
// chance of scanning user-uploaded content as bundle input.

const ALLOWED_CATEGORIES = ["uploads", "generated", "temp"] as const;
type StorageCategory = (typeof ALLOWED_CATEGORIES)[number];

interface StoredFile {
  path: string;
  name: string;
  size: number;
  url: string;
}

/**
 * Get the base storage path from env or fall back to project-local default.
 */
function getStoragePath(): string {
  return process.env.STORAGE_PATH || resolve(process.cwd(), "data", "storage");
}

/**
 * Validate a category is in the allowed set.
 */
function validateCategory(category: string): asserts category is StorageCategory {
  if (!ALLOWED_CATEGORIES.includes(category as StorageCategory)) {
    throw new Error(`Invalid storage category "${category}". Allowed: ${ALLOWED_CATEGORIES.join(", ")}`);
  }
}

/**
 * Sanitize a filename to prevent path traversal.
 */
function sanitizeFilename(filename: string): string {
  if (filename.includes("..")) {
    throw new Error("Invalid filename: path traversal detected");
  }
  const clean = basename(filename);
  if (!clean || clean === "." || clean === "..") {
    throw new Error("Invalid filename");
  }
  return clean;
}

/**
 * Validate organizationId to prevent path traversal.
 */
function validateOrgId(organizationId: string): void {
  if (
    !organizationId ||
    organizationId.includes("..") ||
    organizationId.includes("/") ||
    organizationId.includes("\\")
  ) {
    throw new Error("Invalid organization ID");
  }
}

/**
 * Build the directory path for an org + category.
 */
function getCategoryDir(organizationId: string, category: string): string {
  validateOrgId(organizationId);
  validateCategory(category);
  return join(getStoragePath(), organizationId, category);
}

/**
 * Ensure the org directory structure exists (uploads, generated, temp).
 * Returns the org root directory path.
 */
async function ensureOrgStorage(organizationId: string): Promise<string> {
  validateOrgId(organizationId);
  const orgDir = join(getStoragePath(), organizationId);

  await Promise.all(
    ALLOWED_CATEGORIES.map((cat) => {
      return mkdir(join(orgDir, cat), { recursive: true });
    })
  );

  return orgDir;
}

const MAX_RESUME_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const ALLOWED_RESUME_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".txt", ".md",
]);

export function validateResumeFile(file: File): void {
  if (file.size > MAX_RESUME_SIZE) {
    throw new Error("Resume file too large (max 2 MB)");
  }
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  if (!ALLOWED_RESUME_TYPES.has(file.type) && !ALLOWED_RESUME_EXTENSIONS.has(ext)) {
    throw new Error("Invalid file type. Accepted: PDF, DOCX, DOC, TXT, MD");
  }
}

/**
 * Store a file in org-scoped storage.
 * Filenames are nanoid-prefixed to avoid collisions.
 */
export async function storeFile(
  organizationId: string,
  category: string,
  filename: string,
  data: Buffer
): Promise<StoredFile> {
  const clean = sanitizeFilename(filename);
  const dir = getCategoryDir(organizationId, category);
  await mkdir(dir, { recursive: true });

  const ext = extname(clean);
  const base = basename(clean, ext);
  const uniqueName = `${nanoid()}-${base}${ext}`;
  const filePath = join(dir, uniqueName);

  await writeFile(filePath, data);
  const stats = await stat(filePath);

  return {
    path: filePath,
    name: clean,
    size: stats.size,
    url: `/storage/${organizationId}/${category}/${uniqueName}`,
  };
}

/**
 * Read a file from org-scoped storage.
 */
export async function readFile(
  organizationId: string,
  category: string,
  filename: string
): Promise<Buffer> {
  const clean = sanitizeFilename(filename);
  const dir = getCategoryDir(organizationId, category);
  return fsReadFile(join(dir, clean));
}

/**
 * Delete a file from org-scoped storage.
 */
async function deleteFile(
  organizationId: string,
  category: string,
  filename: string
): Promise<void> {
  const clean = sanitizeFilename(filename);
  const dir = getCategoryDir(organizationId, category);
  await unlink(join(dir, clean));
}

/**
 * List files in an org-scoped storage category.
 */
async function listFiles(
  organizationId: string,
  category: string
): Promise<string[]> {
  const dir = getCategoryDir(organizationId, category);
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

/**
 * Get the absolute filesystem path for a stored file.
 */
function getFilePath(
  organizationId: string,
  category: string,
  filename: string
): string {
  const clean = sanitizeFilename(filename);
  const dir = getCategoryDir(organizationId, category);
  return join(dir, clean);
}
