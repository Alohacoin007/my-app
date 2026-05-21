import Link from "next/link";
import { formatMoney, formatSignedMoney } from "@/lib/odds";

type Props = {
  balanceCents: number;
  pnlCents: number;
  freeCents: number;
  sessionTag?: string;
  isAuthed: boolean;
};

export function Header({
  balanceCents,
  pnlCents,
  freeCents,
  sessionTag = "#1293",
  isAuthed,
}: Props) {
  const pnlPositive = pnlCents >= 0;
  return (
    <header className="brand-header relative px-5 pb-6 pt-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[22px] font-black tracking-wide">ALOHABET</span>
          <span className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-brand-ghost px-2.5 py-1 text-[11px] font-semibold">
            <span className="dot-live" /> LIVE · {sessionTag}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/notifications"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-ghost"
            aria-label="Notifications"
          >
            <BellIcon />
            <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-down px-1 text-[10px] font-bold text-white">
              3
            </span>
          </Link>
          <Link
            href={isAuthed ? "/account" : "/login"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-ghost"
            aria-label="Menu"
          >
            <MoreIcon />
          </Link>
        </div>
      </div>

      <div className="mt-5 flex items-baseline gap-6 text-[11px] font-semibold uppercase tracking-wider text-white/70">
        <span>Balance · USD</span>
        <span>Open P/L</span>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <h1 className="text-[34px] font-black leading-none tracking-tight">
          {formatMoney(balanceCents)}
        </h1>
        <span
          className={`inline-flex items-center rounded-md px-2 py-1 text-sm font-bold ${
            pnlPositive ? "bg-up-soft text-up" : "bg-down-soft text-down"
          }`}
        >
          {formatSignedMoney(pnlCents)}
        </span>
      </div>
      <div className="mt-2 flex gap-5 text-[11px] font-semibold uppercase tracking-wider text-white/70">
        <span>
          Bal {(balanceCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
        <span>
          Free {(freeCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>
    </header>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 15V11a6 6 0 1 1 12 0v4l1.5 2H4.5L6 15Z"
        stroke="white"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M10 19a2 2 0 0 0 4 0" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="5" r="1.6" fill="white" />
      <circle cx="12" cy="12" r="1.6" fill="white" />
      <circle cx="12" cy="19" r="1.6" fill="white" />
    </svg>
  );
}
