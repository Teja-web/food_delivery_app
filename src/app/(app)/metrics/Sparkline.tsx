import type { MetricPoint } from "./serialize";

const W = 320;
const H = 56;
const PAD = 4;

export function Sparkline({ points }: { points: MetricPoint[] }) {
  if (points.length === 0) {
    return <svg width={W} height={H} aria-hidden />;
  }
  if (points.length === 1) {
    return (
      <svg width={W} height={H} aria-hidden>
        <circle cx={W / 2} cy={H / 2} r={3} className="fill-primary" />
      </svg>
    );
  }

  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xRange = maxX - minX || 1;
  const yRange = maxY - minY || 1;

  const path = points
    .map((p, i) => {
      const x = PAD + ((p.t - minX) / xRange) * (W - PAD * 2);
      const y = H - PAD - ((p.v - minY) / yRange) * (H - PAD * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg width={W} height={H} aria-hidden>
      <path d={path} fill="none" strokeWidth={1.5} className="stroke-primary" />
    </svg>
  );
}
