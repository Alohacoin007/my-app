"use client";

import type { ReactNode } from "react";

interface WidgetProps {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}

/**
 * 위젯 공통 프레임. 헤더 전체가 react-grid-layout의 드래그 핸들
 * (`.widget-drag`)로 동작하고, 본문은 스크롤 가능한 영역이다.
 */
export default function Widget({ title, badge, children }: WidgetProps) {
  return (
    <div className="widget-frame flex h-full flex-col overflow-hidden rounded-[10px] border border-hairline bg-surface transition-[border-color,box-shadow] duration-150">
      <header className="widget-drag flex shrink-0 cursor-grab select-none items-center gap-2 border-b border-hairline px-3 py-2 active:cursor-grabbing">
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
        <h2 className="text-xs font-semibold tracking-wide text-ink-2">{title}</h2>
        {badge && <div className="ml-auto">{badge}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
