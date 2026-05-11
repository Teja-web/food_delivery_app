"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/* -- Types --------------------------------------------------- */

interface Signal {
  name: string;
  score: number;
  max: number;
  evidence: string;
}

interface Pillar {
  pillar: string;
  score: number;
  weight: number;
  signals: Signal[];
}

interface TalentRadarProps {
  pillars: Pillar[];
  overall: number;
  rating: string;
  roleFamily: string;
}

/* -- Signal parser ------------------------------------------- */

function parseSignals(raw: string[]): Signal[] {
  return raw.map((s) => {
    // Format: "name: N/M - evidence text"
    const colonIdx = s.indexOf(":");
    if (colonIdx === -1) return { name: s, score: 0, max: 4, evidence: "" };

    const name = s.slice(0, colonIdx).trim();
    const rest = s.slice(colonIdx + 1).trim();

    const scoreMatch = rest.match(/^(\d+)\/(\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1] ?? "0", 10) : 0;
    const max = scoreMatch ? parseInt(scoreMatch[2] ?? "4", 10) : 4;

    const dashIdx = rest.indexOf(" - ");
    const evidence = dashIdx !== -1 ? rest.slice(dashIdx + 3).trim() : "";

    return { name, score, max, evidence };
  });
}

/* -- Pillar labels ------------------------------------------- */

const PILLAR_LABELS: Record<string, string> = {
  coreCompetency: "Core Skills",
  appliedProof: "Applied Proof",
  problemSolving: "Problem Solving",
  operationalMaturity: "Ops Maturity",
  collaborationLeadership: "Leadership",
  trajectory: "Trajectory",
};

/* -- SVG Radar helpers --------------------------------------- */

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function radarPoints(
  cx: number,
  cy: number,
  radius: number,
  values: number[],
  maxValue: number,
) {
  const n = values.length;
  return values.map((v, i) => {
    const angle = (360 / n) * i;
    const r = (v / maxValue) * radius;
    return polarToCartesian(cx, cy, r, angle);
  });
}

function pointsToPath(points: Array<{ x: number; y: number }>) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
}

/* -- Radar SVG ----------------------------------------------- */

function RadarSVG({
  labels,
  values,
  maxValue,
  size = 260,
  onSegmentClick,
  accentColor = "rgba(245, 158, 11, 0.25)",
  strokeColor = "rgb(245, 158, 11)",
}: {
  labels: string[];
  values: number[];
  maxValue: number;
  size?: number;
  onSegmentClick?: (index: number) => void;
  accentColor?: string;
  strokeColor?: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 48;
  const n = labels.length;
  const rings = [0.25, 0.5, 0.75, 1];

  const dataPoints = radarPoints(cx, cy, radius, values, maxValue);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[300px]">
      {/* Grid rings */}
      {rings.map((pct) => {
        const r = radius * pct;
        const pts = Array.from({ length: n }, (_, i) =>
          polarToCartesian(cx, cy, r, (360 / n) * i),
        );
        return (
          <polygon
            key={pct}
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-border"
          />
        );
      })}

      {/* Axis lines */}
      {Array.from({ length: n }, (_, i) => {
        const end = polarToCartesian(cx, cy, radius, (360 / n) * i);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={end.x}
            y2={end.y}
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-border"
          />
        );
      })}

      {/* Data polygon */}
      <path
        d={pointsToPath(dataPoints)}
        fill={accentColor}
        stroke={strokeColor}
        strokeWidth={2}
      />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={3.5}
          fill={strokeColor}
          className={onSegmentClick ? "cursor-pointer" : ""}
          onClick={() => onSegmentClick?.(i)}
        />
      ))}

      {/* Labels */}
      {labels.map((label, i) => {
        const angle = (360 / n) * i;
        const labelR = radius + 24;
        const pos = polarToCartesian(cx, cy, labelR, angle);
        const words = label.split(" ");
        const needsWrap = words.length > 1;
        return (
          <text
            key={i}
            x={pos.x}
            y={pos.y}
            textAnchor="middle"
            dominantBaseline="central"
            className={`fill-muted-foreground text-[9px] font-medium ${onSegmentClick ? "cursor-pointer hover:fill-foreground" : ""}`}
            onClick={() => onSegmentClick?.(i)}
          >
            {needsWrap ? (
              words.map((word, wi) => (
                <tspan
                  key={wi}
                  x={pos.x}
                  dy={wi === 0 ? `${-(words.length - 1) * 0.5}em` : "1em"}
                >
                  {word}
                </tspan>
              ))
            ) : (
              label
            )}
          </text>
        );
      })}

      {/* Center score */}
      <text
        x={cx}
        y={cy - 5}
        textAnchor="middle"
        className="fill-foreground text-[20px] font-bold"
        style={{ fontFamily: "var(--font-mono, monospace)" }}
      >
        {Math.round(values.reduce((a, b) => a + b, 0) / values.length)}
      </text>
      <text
        x={cx}
        y={cy + 10}
        textAnchor="middle"
        className="fill-muted-foreground text-[8px] font-semibold uppercase tracking-widest"
      >
        overall
      </text>
    </svg>
  );
}

/* -- Signal detail view -------------------------------------- */

function SignalDetail({ pillar, onBack }: { pillar: Pillar; onBack: () => void }) {
  const label = PILLAR_LABELS[pillar.pillar] ?? pillar.pillar;

  return (
    <div>
      <Button
        variant="ghost"
        onClick={onBack}
        className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to overview
      </Button>

      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          {pillar.score}/100
        </span>
      </div>

      {/* Sub-radar for signals */}
      {pillar.signals.length >= 3 && (
        <div className="flex justify-center mb-4">
          <RadarSVG
            labels={pillar.signals.map((s) => formatSignalName(s.name))}
            values={pillar.signals.map((s) => s.score)}
            maxValue={pillar.signals[0]?.max ?? 4}
            size={200}
            accentColor="rgba(16, 185, 129, 0.2)"
            strokeColor="rgb(16, 185, 129)"
          />
        </div>
      )}

      {/* Signal list with evidence */}
      <div className="space-y-2.5">
        {pillar.signals.map((signal) => (
          <div key={signal.name} className="rounded-lg bg-secondary/80 px-3 py-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-foreground">
                {formatSignalName(signal.name)}
              </span>
              <div className="flex items-center gap-1">
                {Array.from({ length: signal.max }, (_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 w-3 rounded-full ${i < signal.score ? "bg-emerald-400" : "bg-border"}`}
                  />
                ))}
              </div>
            </div>
            {signal.evidence && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {signal.evidence}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatSignalName(name: string) {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

/* -- Main component ------------------------------------------ */

export function TalentRadar({ pillars, overall, rating, roleFamily }: TalentRadarProps) {
  const [selectedPillar, setSelectedPillar] = useState<Pillar | null>(null);

  // Parse signals from raw strings
  const parsed = pillars.map((p) => ({
    ...p,
    signals: typeof p.signals[0] === "string"
      ? parseSignals(p.signals as unknown as string[])
      : p.signals,
  }));

  if (selectedPillar) {
    const full = parsed.find((p) => p.pillar === selectedPillar.pillar);
    if (full) {
      return (
        <div className="rounded-xl border border-border bg-card p-5">
          <SignalDetail pillar={full} onBack={() => setSelectedPillar(null)} />
        </div>
      );
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Career DNA</h2>
          <p className="text-[11px] text-muted-foreground">
            {roleFamily} — tap a dimension to explore
          </p>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
          {rating}
        </span>
      </div>

      <div className="flex justify-center">
        <RadarSVG
          labels={parsed.map((p) => PILLAR_LABELS[p.pillar] ?? p.pillar)}
          values={parsed.map((p) => p.score)}
          maxValue={100}
          onSegmentClick={(i) => setSelectedPillar(parsed[i]!)}
        />
      </div>
    </div>
  );
}
