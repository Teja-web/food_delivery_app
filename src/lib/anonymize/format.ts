/**
 * UI formatters for the public opportunity surface. Imported by the list
 * card, the detail page, and the OG image so the same DTO renders the same
 * way everywhere. No DB or auth dependency — pure presentation.
 */

import type { PublicRoleDTO } from "./index";

/**
 * Render a role's comp as a band string for the public surface. Anonymized
 * roles already carry a banded label on the DTO; public roles format the
 * exact min/max here. Returns null when comp is undisclosed.
 */
export function formatPublicComp(dto: PublicRoleDTO): string | null {
  if (dto.visibility === "anonymized") return dto.compBand;
  const c = dto.comp;
  if (!c || (c.min == null && c.max == null)) return null;
  return formatExactComp(c.min, c.max ?? c.min, c.currency);
}

export function formatExactComp(
  min: number,
  max: number,
  currency: string | undefined,
): string {
  const cur = currency ?? "USD";
  const symbol = cur === "INR" ? "₹" : cur === "EUR" ? "€" : "$";
  const unit = cur === "INR" ? " LPA" : "k";
  return `${symbol}${min}-${max}${unit}`;
}

/**
 * Posted-date helpers. Two styles:
 *   - "short": compact card label ("Today", "3 days ago", "2 mo ago")
 *   - "long":  spacious detail-page label ("today", "3 days ago", "2 months ago")
 */
export function formatRelativeDate(
  iso: string,
  style: "short" | "long" = "long",
): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return style === "short" ? "Today" : "today";
  if (days === 1) return style === "short" ? "Yesterday" : "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    if (style === "short") return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return style === "short" ? `${months} mo ago` : `${months} months ago`;
  }
  const years = Math.floor(days / 365);
  return style === "short" ? `${years} yr ago` : `${years} years ago`;
}
