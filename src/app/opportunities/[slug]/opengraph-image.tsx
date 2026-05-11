import { ImageResponse } from "next/og";
import { getPublicOpportunity } from "@/operations/public";
import { formatExactComp } from "@/lib/anonymize/format";

export const runtime = "nodejs";
export const alt = "Dilliznt Opportunity";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: { slug: string } }) {
  const dto = await getPublicOpportunity(params.slug);

  const eyebrow =
    dto?.visibility === "anonymized"
      ? dto.publicLabel
      : dto?.visibility === "public"
        ? dto.orgName ?? "Dilliznt Opportunity"
        : "Dilliznt Opportunity";
  const title = dto?.title ?? "Open role";
  const compBand =
    dto?.visibility === "anonymized" && dto.compBand
      ? dto.compBand
      : dto?.visibility === "public" && dto.comp?.min != null
        ? formatExactComp(dto.comp.min, dto.comp.max ?? dto.comp.min, dto.comp.currency)
        : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#FAF7F2",
          padding: "80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Top: brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              backgroundColor: "#D97706",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "24px",
              fontWeight: 700,
            }}
          >
            T
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "22px", fontWeight: 700, color: "#1C1917" }}>
              Dilliznt
            </span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.2em",
                color: "#78716C",
                textTransform: "uppercase",
              }}
            >
              Opportunities
            </span>
          </div>
        </div>

        {/* Middle: role */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <span
            style={{
              fontSize: "20px",
              fontWeight: 700,
              letterSpacing: "0.2em",
              color: "#D97706",
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </span>
          <span
            style={{
              fontSize: "72px",
              fontWeight: 800,
              lineHeight: 1.1,
              color: "#1C1917",
              letterSpacing: "-0.02em",
            }}
          >
            {title.length > 60 ? title.slice(0, 57) + "…" : title}
          </span>
          {compBand && (
            <span style={{ fontSize: "32px", fontWeight: 600, color: "#1C1917" }}>
              {compBand}
            </span>
          )}
        </div>

        {/* Bottom: CTA */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "20px", color: "#78716C" }}>
            Sign up to apply
          </span>
          <span style={{ fontSize: "16px", color: "#A8A29E" }}>dilliznt.com</span>
        </div>
      </div>
    ),
    { ...size },
  );
}

