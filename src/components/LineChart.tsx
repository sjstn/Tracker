import { fmt, niceDate } from "../lib/format";

export interface Point { date: string; value: number }

/** Schlanker Verlaufsgraph ohne Bibliothek. Punkte werden nach Datum verteilt. */
export function LineChart({ points, unit, color = "var(--plate-ink)", height = 150 }: { points: Point[]; unit: string; color?: string; height?: number }) {
  if (points.length < 2) {
    return <p className="text-sm text-soft">Der Verlauf erscheint ab zwei Einträgen.</p>;
  }
  const W = 340, H = height, padL = 6, padR = 6, padT = 14, padB = 22;
  const ts = points.map((p) => new Date(p.date).getTime());
  const vs = points.map((p) => p.value);
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  let v0 = Math.min(...vs), v1 = Math.max(...vs);
  if (v0 === v1) { v0 -= 1; v1 += 1; }
  const x = (t: number) => padL + ((t - t0) / (t1 - t0 || 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - v0) / (v1 - v0)) * (H - padT - padB);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(ts[i]).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const maxI = vs.indexOf(Math.max(...vs));

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img"
        aria-label={`Verlauf von ${fmt(points[0].value)} auf ${fmt(last.value)} ${unit}`}>
        <line x1={padL} x2={W - padR} y1={y(v1)} y2={y(v1)} stroke="var(--line)" strokeDasharray="3 4" />
        <line x1={padL} x2={W - padR} y1={y(v0)} y2={y(v0)} stroke="var(--line)" strokeDasharray="3 4" />
        <text x={W - padR} y={y(v1) - 4} textAnchor="end" fontSize="11" fill="var(--ink-soft)">{fmt(v1)} {unit}</text>
        <text x={padL} y={y(v0) - 4} textAnchor="start" fontSize="11" fill="var(--ink-soft)">{fmt(v0)} {unit}</text>
        <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => <circle key={i} cx={x(ts[i])} cy={y(p.value)} r={i === maxI ? 4.5 : 2.5} fill={i === maxI ? "var(--pr)" : color} />)}
        <text x={padL} y={H - 4} fontSize="11" fill="var(--ink-soft)">{niceDate(points[0].date)}</text>
        <text x={W - padR} y={H - 4} textAnchor="end" fontSize="11" fill="var(--ink-soft)">{niceDate(last.date)}</text>
      </svg>
    </figure>
  );
}
