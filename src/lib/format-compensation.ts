import type { RoleCompensation } from "@/db/schema/roles";

function formatAmount(value: number, currency: string): string {
  const locale = currency === "INR" ? "en-IN" : "en";
  return Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatCompensationRange(comp: RoleCompensation | null | undefined): string {
  if (!comp) return "";
  const currency = comp.currency || "USD";
  const range = `${formatAmount(comp.min, currency)}–${formatAmount(comp.max, currency)}/yr`;
  const parts = [range];
  if (comp.equity) parts.push(comp.equity);
  if (comp.bonus) parts.push(comp.bonus);
  return parts.join(" + ");
}
