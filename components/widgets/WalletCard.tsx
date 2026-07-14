"use client";

/** Wallet 탭 — 잔액 히어로, 입출금 버튼, 최근 내역 (목업). */

const ACTIVITY = [
  { id: "a1", label: "Bet settled — Man City ML", time: "Today 09:14", amount: 210 },
  { id: "a2", label: "Bet placed — 2-leg parlay", time: "Today 08:52", amount: -100 },
  { id: "a3", label: "Deposit", time: "Yesterday 21:03", amount: 1000 },
  { id: "a4", label: "Bet settled — Rays +1.5", time: "Yesterday 18:40", amount: -50 },
];

export default function WalletCard() {
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-hairline px-4 pb-4 pt-3">
        <p className="text-[10px] font-semibold tracking-widest text-ink-muted">BALANCE · USD</p>
        <div className="flex items-end gap-3">
          <div className="min-w-0">
            <p className="text-[28px] font-bold leading-tight">$1,351,756.36</p>
            <p className="mt-0.5 text-xs tabular-nums" style={{ color: "var(--color-up)" }}>
              ▲ $24,310.55 (1.8%) today
            </p>
          </div>
          <svg width="96" height="34" viewBox="0 0 96 34" className="mb-1 ml-auto shrink-0" aria-label="Balance trend" role="img">
            <path
              d="M2,26 L10,23 L18,25 L26,19 L34,21 L42,15 L50,17 L58,12 L66,14 L74,9 L82,11 L92,6"
              fill="none"
              stroke="var(--color-series-1)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="92" cy="6" r="3.5" fill="var(--color-series-1)" stroke="var(--color-surface)" strokeWidth="2" />
          </svg>
        </div>
        <p className="mt-1 text-xs text-ink-2">
          Pending <span className="font-semibold tabular-nums text-ink">$112,020.00</span>
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-md bg-series-1 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            + Deposit
          </button>
          <button
            type="button"
            className="rounded-md border border-hairline py-2 text-sm font-semibold text-ink-2 transition-colors hover:border-ink-muted hover:text-ink"
          >
            Withdraw
          </button>
        </div>
      </div>

      <p className="shrink-0 px-4 pb-1 pt-3 text-[10px] font-semibold tracking-widest text-ink-muted">
        RECENT ACTIVITY
      </p>
      <ul className="min-h-0 flex-1 divide-y divide-hairline overflow-y-auto">
        {ACTIVITY.map((a) => (
          <li key={a.id} className="flex items-center gap-2 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-ink">{a.label}</p>
              <p className="text-[11px] text-ink-muted">{a.time}</p>
            </div>
            <span
              className="shrink-0 text-sm font-semibold tabular-nums"
              style={{ color: a.amount > 0 ? "var(--color-up)" : "var(--color-ink)" }}
            >
              {a.amount > 0 ? "+" : "−"}${Math.abs(a.amount).toLocaleString("en-US")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
