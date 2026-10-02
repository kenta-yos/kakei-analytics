"use client";
import { useEffect, useRef, useState } from "react";

export type LineSeries = {
  values: (number | null)[];
  color: string;
  width?: number;
  dash?: string;
  area?: boolean;
  /** 最後の点に丸を付ける */
  endDot?: boolean;
  /** x の開始位置（index のずれ） */
  offset?: number;
};

type Props = {
  xCount: number;
  series: LineSeries[];
  band?: { min: number[]; max: number[]; color?: string };
  height?: number;
  yMin?: number;
  yMax?: number;
  /** 縦の目印（index） */
  markers?: { index: number; label: string }[];
  ariaLabel: string;
};

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(120, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export default function LineChart({ xCount, series, band, height = 160, yMin, yMax, markers = [], ariaLabel }: Props) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const top = 16;
  const bottom = 6;

  const all = [
    ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)),
    ...(band ? [...band.min, ...band.max] : []),
  ];
  const lo = yMin ?? Math.min(0, ...all);
  const hi = yMax ?? Math.max(1, ...all) * 1.05;
  const x = (i: number) => (xCount <= 1 ? 0 : (i / (xCount - 1)) * (width - 8) + 4);
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo || 1)) * (height - top - bottom);

  const path = (vals: (number | null)[], offset = 0) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i + offset).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };

  const bandPath = band
    ? `M${band.max.map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" L")} L${band.min
        .map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
        .reverse()
        .join(" L")} Z`
    : "";

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
        <line x1={0} x2={width} y1={height - bottom} y2={height - bottom} stroke="#E3E1DB" />
        {lo < 0 && <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="#C9C6BE" strokeDasharray="3 3" />}
        {band && <path d={bandPath} fill={band.color ?? "#8A8D93"} fillOpacity={0.18} />}
        {markers.map((m) => (
          <g key={m.label}>
            <line x1={x(m.index)} x2={x(m.index)} y1={top} y2={height - bottom} stroke="#C9C6BE" strokeDasharray="2 3" />
            <text x={x(m.index)} y={11} fontSize={11} fill="#5D6066" textAnchor="middle">
              {m.label}
            </text>
          </g>
        ))}
        {series.map((s, i) => {
          const d = path(s.values, s.offset);
          const pts = s.values.map((v, j) => ({ v, j })).filter((p) => p.v !== null);
          const last = pts[pts.length - 1];
          const first = pts[0];
          return (
            <g key={i}>
              {s.area && first && last && (
                <path
                  d={`${d} L${x(last.j + (s.offset ?? 0))} ${height - bottom} L${x(first.j + (s.offset ?? 0))} ${height - bottom} Z`}
                  fill={s.color}
                  fillOpacity={0.1}
                />
              )}
              <path d={d} fill="none" stroke={s.color} strokeWidth={s.width ?? 2.2} strokeDasharray={s.dash} strokeLinejoin="round" />
              {s.endDot && last && (
                <circle cx={x(last.j + (s.offset ?? 0))} cy={y(last.v as number)} r={4.5} fill={s.color} stroke="#fff" strokeWidth={1.5} />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** 1〜12月の目盛り。点の位置（i / 11）にそろえて置く */
export function MonthAxis({ months = [1, 4, 7, 10, 12] }: { months?: number[] }) {
  return (
    <div className="relative h-4 text-xs text-sub">
      {months.map((m) => (
        <span
          key={m}
          className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
          style={{ left: `calc(4px + (100% - 8px) * ${(m - 1) / 11})` }}
        >
          {m}月
        </span>
      ))}
    </div>
  );
}
