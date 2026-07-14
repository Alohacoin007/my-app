"use client";

import { useState } from "react";
import type { Selection } from "@/lib/data";

interface Props {
  selections: Selection[];
  onRemove: (id: string) => void;
}

/** 담긴 선택들을 조합(파라레이)으로 묶어 예상 적중액을 계산하는 베팅 슬립. */
export default function BetSlip({ selections, onRemove }: Props) {
  const [stake, setStake] = useState("10000");
  const stakeNum = Math.max(0, Number(stake.replaceAll(",", "")) || 0);
  const combinedOdds = selections.reduce((acc, s) => acc * s.odds, 1);
  const payout = selections.length > 0 ? Math.floor(stakeNum * combinedOdds) : 0;

  if (selections.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
        <p className="text-sm text-ink-2">슬립이 비어 있습니다</p>
        <p className="text-xs text-ink-muted">배당판에서 배당률을 눌러 베팅을 담아보세요.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ul className="min-h-0 flex-1 divide-y divide-hairline overflow-auto">
        {selections.map((s) => (
          <li key={s.id} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-ink">{s.matchLabel}</p>
              <p className="text-[11px] text-ink-muted">{s.marketLabel}</p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
              {s.odds.toFixed(2)}
            </span>
            <button
              type="button"
              onClick={() => onRemove(s.id)}
              aria-label={`${s.matchLabel} ${s.marketLabel} 선택 삭제`}
              className="shrink-0 rounded p-1 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      <div className="shrink-0 space-y-2 border-t border-hairline px-3 py-2.5">
        <label className="flex items-center justify-between gap-2 text-xs text-ink-2">
          베팅 금액
          <span className="flex items-center gap-1">
            <input
              type="text"
              inputMode="numeric"
              value={stake}
              onChange={(e) => setStake(e.target.value.replace(/[^\d]/g, ""))}
              className="w-24 rounded-md border border-hairline bg-surface-2 px-2 py-1 text-right text-sm tabular-nums text-ink outline-none focus:border-series-1"
            />
            <span className="text-ink-muted">원</span>
          </span>
        </label>
        <div className="flex justify-between text-xs text-ink-2">
          <span>조합 배당 ({selections.length}폴드)</span>
          <span className="font-semibold tabular-nums text-ink">{combinedOdds.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs text-ink-2">
          <span>예상 적중액</span>
          <span className="font-semibold tabular-nums" style={{ color: "var(--color-up)" }}>
            {payout.toLocaleString("ko-KR")}원
          </span>
        </div>
        <button
          type="button"
          disabled={stakeNum === 0}
          className="w-full rounded-md bg-series-1 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => alert("프로토타입: 베팅 제출은 구현되지 않았습니다.")}
        >
          베팅하기
        </button>
      </div>
    </div>
  );
}
