"use client";

import type { ReactNode } from "react";

interface WidgetProps {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  /** false면 드래그 핸들 스타일(그립 아이콘·grab 커서)을 끈다 — 모바일 스택 레이아웃용 */
  draggable?: boolean;
}

/**
 * 위젯 공통 프레임. 헤더 전체가 react-grid-layout의 드래그 핸들
 * (`.widget-drag`)로 동작하고, 본문은 스크롤 가능한 영역이다.
 */
export default function Widget({ title, badge, children, draggable = true }: WidgetProps) {
  return (
    <div className="widget-frame flex h-full flex-col overflow-hidden rounded-[10px] border border-hairline bg-surface transition-[border-color,box-shadow] duration-150">
      <header
        className={`flex shrink-0 select-none items-center gap-2 border-b border-hairline px-3 py-2 ${
          draggable ? "widget-drag cursor-grab active:cursor-grabbing" : ""
        }`}
      >
        {draggable && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className="text-ink-muted opacity-60"
            aria-hidden
          >
            {[0, 4, 8].map((y) =>
              [0, 4, 8].map((x) => (
                <rect key={`${x}${y}`} x={x} y={y} width="2" height="2" fill="currentColor" />
              )),
            )}
          </svg>
        )}
        <h2 className="text-xs font-semibold tracking-wide text-ink-2">{title}</h2>
        {badge && <div className="ml-auto">{badge}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
