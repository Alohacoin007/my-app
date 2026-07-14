"use client";

import { useMemo, useRef, useState } from "react";
import { buildOddsHistory } from "@/lib/data";
import { useElementSize } from "@/lib/useElementSize";

const SERIES = [
  { key: "home" as const, label: "Home win (Man City)", color: "var(--color-series-1)" },
  { key: "away" as const, label: "Away win (Arsenal)", color: "var(--color-series-2)" },
];

const PAD = { top: 12, right: 16, bottom: 24, left: 38 };

/**
 * 홈/원정 승 배당 추이 라인 차트 (SVG 직접 렌더링).
 * 2px 라인, 8px 엔드 마커 + 2px 서피스 링, 크로스헤어 + 툴팁 호버 레이어.
 */
export default function OddsTrendChart() {
  const data = useMemo(buildOddsHistory, []);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(wrapRef);
  const [hover, setHover] = useState<number | null>(null);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = Math.max(0, height - PAD.top - PAD.bottom);

  const values = data.flatMap((d) => [d.home, d.away]);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // y축 눈금은 0.25 단위의 깔끔한 수로 스냅
  const yMin = Math.floor(rawMin * 4) / 4;
  const yMax = Math.ceil(rawMax * 4) / 4;
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let v = yMin; v <= yMax + 1e-9; v += 0.25) ticks.push(Math.round(v * 100) / 100);
    return ticks;
  }, [yMin, yMax]);

  const x = (i: number) => PAD.left + (plotW * i) / (data.length - 1);
  const y = (v: number) => PAD.top + plotH * (1 - (v - yMin) / (yMax - yMin));

  const linePath = (key: "home" | "away") =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join("");

  const onMove = (e: React.MouseEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || plotW <= 0) return;
    const px = e.clientX - rect.left - PAD.left;
    const i = Math.round((px / plotW) * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, i)));
  };

  const last = data[data.length - 1];
  const first = data[0];
  const ready = width > 0 && height > 0;
  const hovered = hover !== null ? data[hover] : null;
  const tooltipLeft = hover !== null ? x(hover) : 0;
  const tooltipFlip = hover !== null && hover > data.length * 0.6;

  return (
    <div className="flex h-full flex-col">
      {/* 범례 + 현재 배당 (2개 시리즈이므로 범례 항상 표시) */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-3 pt-2 text-xs">
        {SERIES.map((s) => {
          const cur = last[s.key];
          const delta = Math.round((cur - first[s.key]) * 100) / 100;
          const up = delta > 0;
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-ink-2">{s.label}</span>
              <span className="font-semibold tabular-nums text-ink">{cur.toFixed(2)}</span>
              <span
                className="tabular-nums"
                style={{ color: delta === 0 ? "var(--color-ink-muted)" : up ? "var(--color-up)" : "var(--color-down)" }}
              >
                {delta === 0 ? "—" : `${up ? "▲" : "▼"} ${Math.abs(delta).toFixed(2)}`}
              </span>
            </div>
          );
        })}
      </div>

      <div
        ref={wrapRef}
        className="relative min-h-0 flex-1"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {ready && (
          <svg width={width} height={height} role="img" aria-label="Odds trend over the last 24 hours">
            {/* 가로 그리드라인 + y축 눈금 */}
            {yTicks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--color-grid-line)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 6}
                  y={y(t) + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill="var(--color-ink-muted)"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {t.toFixed(2)}
                </text>
              </g>
            ))}
            {/* x축 눈금 (6시간 간격) */}
            {data.map((d, i) =>
              i % 6 === 0 ? (
                <text
                  key={i}
                  x={x(i)}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--color-ink-muted)"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {d.label}
                </text>
              ) : null,
            )}

            {/* 크로스헤어 */}
            {hover !== null && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--color-baseline)"
                strokeWidth={1}
              />
            )}

            {SERIES.map((s) => (
              <g key={s.key}>
                <path
                  d={linePath(s.key)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {/* 엔드 마커: 서피스 링 2px */}
                <circle
                  cx={x(data.length - 1)}
                  cy={y(last[s.key])}
                  r={4}
                  fill={s.color}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                />
                {hover !== null && (
                  <circle
                    cx={x(hover)}
                    cy={y(data[hover][s.key])}
                    r={4}
                    fill={s.color}
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                  />
                )}
              </g>
            ))}
          </svg>
        )}

        {/* 툴팁 */}
        {hovered && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-md border border-hairline bg-surface-2 px-2.5 py-1.5 text-xs shadow-lg"
            style={
              tooltipFlip
                ? { right: width - tooltipLeft + 8 }
                : { left: tooltipLeft + 8 }
            }
          >
            <div className="mb-1 font-semibold tabular-nums text-ink-2">{hovered.label}</div>
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="text-ink-2">{s.label.split(" (")[0]}</span>
                <span className="ml-auto pl-3 font-semibold tabular-nums text-ink">
                  {hovered[s.key].toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
