"use client";

import { useCallback, useRef, useState } from "react";
import { GridLayout, type Layout, type LayoutItem } from "react-grid-layout";
import Widget from "@/components/Widget";
import OddsTrendChart from "@/components/widgets/OddsTrendChart";
import LiveOddsBoard from "@/components/widgets/LiveOddsBoard";
import BetSlip from "@/components/widgets/BetSlip";
import GameSchedule from "@/components/widgets/GameSchedule";
import type { Selection } from "@/lib/data";
import { useElementSize } from "@/lib/useElementSize";

/** 24x24 그리드: 가로 24컬럼, 세로 24행이 뷰포트를 정확히 채운다. */
const GRID = 24;
const MARGIN = 8;
const PADDING = 8;
const LAYOUT_STORAGE_KEY = "betboard-layout-v1";

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "chart", x: 0, y: 0, w: 14, h: 13, minW: 8, minH: 7 },
  { i: "odds", x: 14, y: 0, w: 10, h: 13, minW: 6, minH: 6 },
  { i: "schedule", x: 0, y: 13, w: 14, h: 11, minW: 6, minH: 5 },
  { i: "betslip", x: 14, y: 13, w: 10, h: 11, minW: 6, minH: 6 },
];

function loadLayout(): LayoutItem[] {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as LayoutItem[];
    // 저장본에 4개 위젯이 모두 있어야 유효한 레이아웃으로 취급
    const keys = new Set(parsed.map((l) => l.i));
    return DEFAULT_LAYOUT.every((d) => keys.has(d.i)) ? parsed : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export default function Dashboard() {
  const gridRef = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(gridRef);
  const [layout, setLayout] = useState<LayoutItem[]>(loadLayout);
  const [selections, setSelections] = useState<Selection[]>([]);

  // 세로 24행이 컨테이너 높이에 딱 맞도록 행 높이를 역산
  const rowHeight = (height - PADDING * 2 - MARGIN * (GRID - 1)) / GRID;

  const onLayoutChange = useCallback((next: Layout) => {
    setLayout([...next]);
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 저장 실패(프라이빗 모드 등)는 무시 — 레이아웃은 메모리에서 유지된다
    }
  }, []);

  const resetLayout = useCallback(() => {
    window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
    setLayout(DEFAULT_LAYOUT.map((l) => ({ ...l })));
  }, []);

  const toggleSelection = useCallback((sel: Selection) => {
    setSelections((prev) =>
      prev.some((s) => s.id === sel.id)
        ? prev.filter((s) => s.id !== sel.id)
        : [...prev, sel],
    );
  }, []);

  const removeSelection = useCallback((id: string) => {
    setSelections((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-2.5">
        <h1 className="text-sm font-bold tracking-wide">
          BetBoard <span className="font-normal text-ink-muted">— 스포츠 베팅 대시보드</span>
        </h1>
        <p className="hidden text-xs text-ink-muted sm:block">
          위젯 헤더를 드래그해 이동, 우하단 모서리를 끌어 크기 조절
        </p>
        <button
          type="button"
          onClick={resetLayout}
          className="ml-auto rounded-md border border-hairline px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-ink-muted hover:text-ink"
        >
          레이아웃 초기화
        </button>
      </header>

      {/* 24행이 화면 높이에 맞춰지지만, 배치 중 잠시 밀려난 위젯은 스크롤로 접근 가능 */}
      <div ref={gridRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {width > 0 && height > 0 && (
          <GridLayout
            className="layout"
            layout={layout}
            width={width}
            gridConfig={{
              cols: GRID,
              maxRows: GRID,
              rowHeight,
              margin: [MARGIN, MARGIN],
              containerPadding: [PADDING, PADDING],
            }}
            dragConfig={{ handle: ".widget-drag", bounded: true }}
            onLayoutChange={onLayoutChange}
          >
            <div key="chart">
              <Widget title="배당률 추이 — 맨체스터 시티 vs 아스날 (최근 24시간)">
                <OddsTrendChart />
              </Widget>
            </div>
            <div key="odds">
              <Widget title="실시간 배당판">
                <LiveOddsBoard selections={selections} onToggle={toggleSelection} />
              </Widget>
            </div>
            <div key="schedule">
              <Widget title="경기 일정 · 스코어">
                <GameSchedule />
              </Widget>
            </div>
            <div key="betslip">
              <Widget
                title="베팅 슬립"
                badge={
                  selections.length > 0 ? (
                    <span className="rounded-full bg-series-1 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
                      {selections.length}
                    </span>
                  ) : undefined
                }
              >
                <BetSlip selections={selections} onRemove={removeSelection} />
              </Widget>
            </div>
          </GridLayout>
        )}
      </div>
    </div>
  );
}
