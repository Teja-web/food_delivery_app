import { MarkItDown } from "markitdown-ts";

interface ExtractedDocument {
  /** Extracted text content (markdown formatted) */
  text: string;
  /** Document title if available */
  title?: string | null;
  /** Original filename if available */
  filename?: string;
}

// Singleton instance
const markitdown = new MarkItDown();

/**
 * Detect if text looks like binary garbage rather than readable content.
 * Checks for high ratio of non-printable / control characters that indicate
 * a failed file extraction (e.g. PlainTextConverter reading raw .docx bytes).
 */
function validateExtractedText(text: string, source: string): void {
  if (!text || text.length === 0) {
    throw new Error(`Extraction produced empty text from: ${source}`);
  }

  // Count non-printable chars (excluding normal whitespace: \t \n \r)
  let nonPrintable = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
      (code >= 127 && code <= 159) ||
      code === 65533 // Unicode replacement character (�)
    ) {
      nonPrintable++;
    }
  }

  const ratio = nonPrintable / text.length;
  if (ratio > 0.05) {
    throw new Error(
      `File extraction produced binary/garbled output (${(ratio * 100).toFixed(1)}% non-printable characters). The file may be corrupted or in an unsupported format: ${source}`
    );
  }

  // Check for common binary file signatures that survived as text
  const head = text.slice(0, 20);
  if (head.startsWith("PK") || head.startsWith("%PDF") || head.includes("\x89PNG")) {
    throw new Error(
      `File extraction returned raw binary content instead of extracted text. The converter likely failed silently: ${source}`
    );
  }

  // Detect scanned/image-only PDFs where extraction yields only page markers
  // markitdown-ts emits "-- N of M --" separators but no actual content for these
  const withoutPageMarkers = text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, "").trim();
  if (withoutPageMarkers.length < 20) {
    throw new Error(
      `The document appears to be scanned or image-based with no extractable text. Please upload a text-based PDF or DOCX file instead.`
    );
  }
}

/**
 * Normalize extracted text for proper markdown rendering
 * - Normalizes line endings (CRLF -> LF)
 * - Preserves paragraph breaks (double newlines)
 * - Converts single newlines within paragraphs to spaces
 * - Preserves list items and headers
 * - Cleans up excessive whitespace
 */
function normalizeText(text: string): string {
  return text
    .replace(/\0/g, "")
    // Strip base64 data URIs (images embedded in DOCX/PDF exports)
    .replace(/data:[a-zA-Z/+\-]+;base64,[^\s"')>\]]+/g, "")
    // Strip img tags (may contain base64 src or external URLs)
    .replace(/<img[^>]*>/gi, "")
    // Strip remaining HTML tags, keep text content
    .replace(/<[^>]+>/g, " ")
    // Normalize line endings
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Protect markdown elements (headers, lists, code blocks)
    .replace(/^(#{1,6}\s)/gm, "@@HEADER@@$1")
    .replace(/^(\s*[-*+]\s)/gm, "@@LIST@@$1")
    .replace(/^(\s*\d+\.\s)/gm, "@@OLIST@@$1")
    .replace(/^(```)/gm, "@@CODE@@$1")
    // Normalize multiple newlines to double newline (paragraph break)
    .replace(/\n{3,}/g, "\n\n")
    // Convert single newlines to spaces (except before protected elements)
    .replace(/\n(?!@@|$|\n)/g, " ")
    // Restore paragraph breaks
    .replace(/\n\n/g, "\n\n")
    // Restore protected elements with proper newlines
    .replace(/@@HEADER@@/g, "\n")
    .replace(/@@LIST@@/g, "\n")
    .replace(/@@OLIST@@/g, "\n")
    .replace(/@@CODE@@/g, "\n")
    // Clean up multiple spaces
    .replace(/ {2,}/g, " ")
    // Trim lines
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    // Final cleanup
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract text content from a file using markitdown-ts
 * Supports: PDF, DOCX, XLSX, PPTX, HTML, and more
 *
 * @param filePath - Path to the file to extract text from
 * @returns Extracted text content
 */
export async function extractTextFromFile(
  filePath: string
): Promise<ExtractedDocument> {
  const result = await markitdown.convert(filePath);

  if (!result) {
    throw new Error(`Failed to extract text from file: ${filePath}`);
  }

  const rawText = result.markdown;
  validateExtractedText(rawText, filePath);

  return {
    text: normalizeText(rawText),
    title: result.title,
    filename: filePath.split("/").pop(),
  };
}

/**
 * Extract text content from a buffer
 *
 * @param buffer - File buffer
 * @param fileExtension - File extension (e.g., "pdf", "docx")
 * @returns Extracted text content
 */
async function extractTextFromBuffer(
  buffer: Buffer,
  fileExtension: string
): Promise<ExtractedDocument> {
  const result = await markitdown.convertBuffer(buffer, {
    file_extension: fileExtension.startsWith(".") ? fileExtension : `.${fileExtension}`,
  });

  if (!result) {
    throw new Error(`Failed to extract text from buffer`);
  }

  const rawText = result.markdown;
  validateExtractedText(rawText, `buffer.${fileExtension}`);

  return {
    text: normalizeText(rawText),
    title: result.title,
  };
}

/**
 * Check if a file type is supported by markitdown
 */
function isSupportedFileType(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const supportedExtensions = [
    // Documents
    "pdf",
    "docx",
    "doc",
    "rtf",
    "txt",
    "md",
    // Spreadsheets
    "xlsx",
    "xls",
    "csv",
    // Presentations
    "pptx",
    "ppt",
    // Web
    "html",
    "htm",
    // Images (OCR)
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    // Other
    "json",
    "xml",
  ];
  return supportedExtensions.includes(ext);
}

/**
 * Get supported file extensions for file input accept attribute
 */
function getSupportedExtensions(): string[] {
  return [".pdf", ".doc", ".docx", ".txt", ".rtf", ".md", ".html"];
}

/**
 * Get accept string for file input
 */
function getAcceptString(): string {
  return ".pdf,.doc,.docx,.txt,.rtf,.md,.html";
}
