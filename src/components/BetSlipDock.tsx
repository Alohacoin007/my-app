"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBetSlip } from "./BetSlipProvider";
import {
  combineAmerican,
  formatAmerican,
  formatMoney,
  payoutCents,
} from "@/lib/odds";

export function BetSlipDock() {
  const { selections, remove, clear, open, setOpen } = useBetSlip();
  const [stakeStr, setStakeStr] = useState("50.00");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (selections.length === 0) return null;

  const stake = parseFloat(stakeStr || "0") || 0;
  const stakeCents = Math.round(stake * 100);
  const combinedOdds = combineAmerican(selections.map((s) => s.americanOdds));
  const payout = payoutCents(stakeCents, combinedOdds);
  const profit = payout - stakeCents;

  async function place() {
    setError(null);
    if (stakeCents <= 0) {
      setError("Enter a stake greater than 0.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stakeCents,
          selections: selections.map((s) => ({
            matchId: s.matchId,
            market: s.market,
            pick: s.pick,
            line: s.line,
            americanOdds: s.americanOdds,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "UNAUTHENTICATED") {
          router.push("/login?next=/");
          return;
        }
        setError(data.message ?? data.error ?? "Failed to place bet");
        return;
      }
      clear();
      setOpen(false);
      router.push("/history");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40">
      <div className="container-app">
        <div className="mx-3 mb-20 overflow-hidden rounded-2xl border border-ink-line bg-white shadow-slip">
          <button
            onClick={() => setOpen(!open)}
            className="flex w-full items-center justify-between bg-ink px-4 py-3 text-white"
          >
            <span className="text-sm font-bold uppercase tracking-wide">
              Bet Slip · {selections.length}
            </span>
            <span className="text-sm font-bold tabular-nums">
              {formatAmerican(combinedOdds)}
            </span>
          </button>

          {open && (
            <div className="px-4 py-3">
              <ul className="row-divider">
                {selections.map((s) => (
                  <li
                    key={`${s.matchId}-${s.market}`}
                    className="flex items-start justify-between py-2"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-[13px] font-bold text-ink">
                        {s.pickLabel}
                      </p>
                      <p className="text-[11px] uppercase tracking-wider text-brand">
                        {s.market}
                      </p>
                      <p className="truncate text-[11px] text-ink-mid">
                        {s.matchLabel}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pl-2">
                      <span className="text-sm font-bold tabular-nums">
                        {formatAmerican(s.americanOdds)}
                      </span>
                      <button
                        onClick={() => remove(s.matchId, s.market)}
                        className="text-ink-soft hover:text-down"
                        aria-label="Remove selection"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-mid">
                    Wager
                  </span>
                  <div className="mt-1 flex items-center rounded-lg border border-ink-line px-3 py-2">
                    <span className="mr-1 text-ink-mid">$</span>
                    <input
                      inputMode="decimal"
                      value={stakeStr}
                      onChange={(e) =>
                        setStakeStr(e.target.value.replace(/[^0-9.]/g, ""))
                      }
                      className="w-full bg-transparent text-base font-bold focus:outline-none"
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-mid">
                    To Win
                  </span>
                  <div className="mt-1 flex items-center rounded-lg border border-ink-line bg-surface-chip px-3 py-2">
                    <span className="mr-1 text-ink-mid">$</span>
                    <span className="text-base font-bold text-ink">
                      {(profit / 100).toFixed(2)}
                    </span>
                  </div>
                </label>
              </div>

              <div className="mt-2 flex items-center justify-between text-[12px] text-ink-mid">
                <span>
                  {selections.length > 1 ? "Parlay" : "Single"} · combined{" "}
                  <span className="font-bold text-ink">
                    {formatAmerican(combinedOdds)}
                  </span>
                </span>
                <span>
                  Payout{" "}
                  <span className="font-bold text-ink">
                    {formatMoney(payout)}
                  </span>
                </span>
              </div>

              {error && (
                <p className="mt-2 text-sm font-semibold text-down">{error}</p>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={clear}
                  className="flex-1 rounded-lg border border-ink-line bg-white px-4 py-2.5 text-sm font-bold text-ink"
                >
                  Clear
                </button>
                <button
                  onClick={place}
                  disabled={submitting}
                  className="flex-[2] rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {submitting ? "Placing…" : "Place Bet"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2m-7 0 1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
