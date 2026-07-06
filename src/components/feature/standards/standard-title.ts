export function titleFromFileName(fileName: string): string {
  const normalizedName = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
  return normalizedName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fileNameFromTitle(value: string, type: ".md" | ".txt" = ".md"): string {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "artifact"}${type}`;
}
