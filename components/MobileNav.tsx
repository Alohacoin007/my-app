"use client";

export type MobileTab = "home" | "live" | "bets" | "wallet";

const NAV: { key: MobileTab; label: string; icon: React.ReactNode }[] = [
  {
    key: "home",
    label: "Home",
    icon: (
      <path d="M2 7.5 8 2l6 5.5V14a1 1 0 0 1-1 1h-3.2v-4.2H6.2V15H3a1 1 0 0 1-1-1V7.5Z" strokeLinejoin="round" />
    ),
  },
  {
    key: "live",
    label: "Live",
    icon: (
      <>
        <circle cx="8" cy="9" r="2" />
        <path d="M4.5 12.5a5 5 0 0 1 0-7M11.5 5.5a5 5 0 0 1 0 7M2.5 14.5a8 8 0 0 1 0-11M13.5 3.5a8 8 0 0 1 0 11" strokeLinecap="round" />
      </>
    ),
  },
  {
    key: "bets",
    label: "My Bets",
    icon: (
      <path d="M2 5.5V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1.5a1.5 1.5 0 0 0 0 3V10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8.5a1.5 1.5 0 0 0 0-3ZM6 3v8" strokeLinejoin="round" />
    ),
  },
  {
    key: "wallet",
    label: "Wallet",
    icon: (
      <>
        <rect x="2" y="4" width="12" height="9" rx="1.5" />
        <path d="M10 8.5h2M2 6.5h12" />
      </>
    ),
  },
];

interface Props {
  tab: MobileTab;
  onChange: (tab: MobileTab) => void;
  /** My Bets 탭 배지에 표시할 개수 (0이면 숨김) */
  betCount: number;
}

/** 모바일 하단 4탭 내비게이션 (Home · Live · My Bets · Wallet) */
export default function MobileNav({ tab, onChange, betCount }: Props) {
  return (
    <nav className="grid shrink-0 grid-cols-4 border-t border-hairline bg-surface px-2 pb-1.5 pt-1">
      {NAV.map((n) => {
        const active = tab === n.key;
        return (
          <button
            key={n.key}
            type="button"
            onClick={() => onChange(n.key)}
            aria-pressed={active}
            className={`relative flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] font-medium transition-colors ${
              active ? "text-series-1" : "text-ink-muted hover:text-ink-2"
            }`}
          >
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
              {n.icon}
            </svg>
            {n.key === "bets" && betCount > 0 && (
              <span
                className="absolute right-1/2 top-0 flex h-3.5 min-w-3.5 -translate-y-0.5 translate-x-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                style={{ background: "var(--color-down)" }}
              >
                {betCount}
              </span>
            )}
            {n.label}
          </button>
        );
      })}
    </nav>
  );
}
