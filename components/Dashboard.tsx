"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GridLayout, type Layout, type LayoutItem } from "react-grid-layout";
import MobileNav, { type MobileTab } from "@/components/MobileNav";
import Widget from "@/components/Widget";
import WalletCard from "@/components/widgets/WalletCard";
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
  { i: "schedule", x: 0, y: 13, w: 9, h: 11, minW: 5, minH: 5 },
  { i: "betslip", x: 9, y: 13, w: 7, h: 11, minW: 5, minH: 6 },
  { i: "wallet", x: 16, y: 13, w: 8, h: 11, minW: 5, minH: 6 },
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

  // 좁은 화면(모바일)에서는 그리드 대신 하단 4탭(Home·Live·My Bets·Wallet) 레이아웃으로 전환
  const isMobile = width > 0 && width < 700;
  const [mobileTab, setMobileTab] = useState<MobileTab>("home");

  const onLayoutChange = useCallback((next: Layout) => {
    setLayout([...next]);
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 저장 실패(프라이빗 모드 등)는 무시 — 레이아웃은 메모리에서 유지된다
    }
  }, []);

  const resetLayout = useCallback(() => {
    try {
      window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
    } catch {
      // 스토리지가 막힌 환경(샌드박스 iframe 등)에서도 초기화는 동작해야 한다
    }
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

  // 화이트가 기본, <html data-theme="dark">로 전환. 선택은 localStorage에 저장
  const [theme, setTheme] = useState<"dark" | "light">("light");
  useEffect(() => {
    try {
      if (window.localStorage.getItem("betboard-theme") === "dark") {
        setTheme("dark");
        document.documentElement.dataset.theme = "dark";
      }
    } catch {
      // 스토리지가 막힌 환경에서는 기본 테마로 시작
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        window.localStorage.setItem("betboard-theme", next);
      } catch {
        // 저장 실패는 무시
      }
      return next;
    });
  }, []);

  // Fullscreen API를 지원하는 환경(권한이 막힌 iframe 제외)에서만 버튼 노출
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        // 권한이 없으면 조용히 무시 (버튼은 fullscreenEnabled일 때만 보인다)
      });
    }
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-2.5">
        <h1 className="text-sm font-bold tracking-wide">
          BetBoard <span className="font-normal text-ink-muted">— Sports Betting Dashboard</span>
        </h1>
        {!isMobile && (
          <p className="hidden text-xs text-ink-muted sm:block">
            Drag a widget header to move it; drag the bottom-right corner to resize
          </p>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!isMobile && (
            <button
              type="button"
              onClick={resetLayout}
              className="rounded-md border border-hairline px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-ink-muted hover:text-ink"
            >
              Reset layout
            </button>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Light theme" : "Dark theme"}
            className="rounded-md border border-hairline p-1.5 text-ink-2 transition-colors hover:border-ink-muted hover:text-ink"
          >
            {theme === "dark" ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <circle cx="6" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M6 0.6v1.2M6 10.2v1.2M0.6 6h1.2M10.2 6h1.2M2.2 2.2l0.85 0.85M8.95 8.95l0.85 0.85M9.8 2.2l-0.85 0.85M3.05 8.95l-0.85 0.85"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path
                  d="M10.4 7.2A4.8 4.8 0 1 1 4.8 1.6a3.9 3.9 0 0 0 5.6 5.6Z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              className="rounded-md border border-hairline p-1.5 text-ink-2 transition-colors hover:border-ink-muted hover:text-ink"
            >
              {isFullscreen ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path
                    d="M4.5 1v3.5H1M7.5 1v3.5H11M4.5 11V7.5H1M7.5 11V7.5H11"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path
                    d="M1 4.5V1h3.5M11 4.5V1H7.5M1 7.5V11h3.5M11 7.5V11H7.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          )}
        </div>
      </header>

      {/* 24행이 화면 높이에 맞춰지지만, 배치 중 잠시 밀려난 위젯은 스크롤로 접근 가능 */}
      <div ref={gridRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {isMobile && (
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {mobileTab === "home" && (
                <div className="flex flex-col gap-2 p-2">
                  <div className="h-[300px]">
                    <Widget draggable={false} title="Odds Trend — Man City vs Arsenal (Last 24h)">
                      <OddsTrendChart />
                    </Widget>
                  </div>
                  <Widget draggable={false} title="Live Odds Board">
                    <LiveOddsBoard selections={selections} onToggle={toggleSelection} />
                  </Widget>
                </div>
              )}
              {mobileTab === "live" && (
                <div className="h-full p-2">
                  <Widget draggable={false} title="Schedule · Scores">
                    <GameSchedule />
                  </Widget>
                </div>
              )}
              {mobileTab === "bets" && (
                <div className="h-full p-2">
                  <Widget
                    draggable={false}
                    title="Bet Slip"
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
              )}
              {mobileTab === "wallet" && (
                <div className="h-full p-2">
                  <Widget draggable={false} title="Wallet">
                    <WalletCard />
                  </Widget>
                </div>
              )}
            </div>
            <MobileNav tab={mobileTab} onChange={setMobileTab} betCount={selections.length} />
          </div>
        )}
        {!isMobile && width > 0 && height > 0 && (
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
              <Widget title="Odds Trend — Man City vs Arsenal (Last 24h)">
                <OddsTrendChart />
              </Widget>
            </div>
            <div key="odds">
              <Widget title="Live Odds Board">
                <LiveOddsBoard selections={selections} onToggle={toggleSelection} />
              </Widget>
            </div>
            <div key="schedule">
              <Widget title="Schedule · Scores">
                <GameSchedule />
              </Widget>
            </div>
            <div key="betslip">
              <Widget
                title="Bet Slip"
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
            <div key="wallet">
              <Widget title="Wallet">
                <WalletCard />
              </Widget>
            </div>
          </GridLayout>
        )}
      </div>
    </div>
  );
}
