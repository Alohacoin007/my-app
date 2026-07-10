"use client";

import { useBetSlip, type Selection } from "./BetSlipProvider";
import { formatAmerican } from "@/lib/odds";

type Props = {
  matchId: string;
  matchLabel: string;
  pickLabel: string;
  market: Selection["market"];
  pick: Selection["pick"];
  line: number | null;
  americanOdds: number | null | undefined;
  topLine?: string;
};

export function OddsButton({
  matchId,
  matchLabel,
  pickLabel,
  market,
  pick,
  line,
  americanOdds,
  topLine,
}: Props) {
  const { add, isSelected } = useBetSlip();
  const disabled = americanOdds == null;
  const active = !disabled && isSelected(matchId, market, pick);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() =>
        americanOdds != null &&
        add({
          matchId,
          matchLabel,
          pickLabel,
          market,
          pick,
          line,
          americanOdds,
        })
      }
      className={`odds-btn ${active ? "odds-btn-active" : ""} disabled:opacity-40`}
    >
      {topLine && (
        <span
          className={`text-[12px] font-bold leading-none ${
            active ? "text-white/90" : "text-ink-mid"
          }`}
        >
          {topLine}
        </span>
      )}
      <span className="mt-0.5 text-sm font-extrabold tabular-nums">
        {formatAmerican(americanOdds)}
      </span>
    </button>
  );
}
