import Link from "next/link";

export function PromoCard({ isAuthed }: { isAuthed: boolean }) {
  return (
    <div className="mx-4 my-4 rounded-2xl border border-ink-line bg-white p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="chip bg-brand text-white">NEW</span>
        <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-mid">
          Welcome Bonus
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-bold text-ink">
          Top up your virtual bankroll with $1,000,000
        </p>
        <Link
          href={isAuthed ? "/account" : "/signup"}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
        >
          {isAuthed ? "Claim" : "Sign up"}
          <ArrowIcon />
        </Link>
      </div>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12h14m0 0-5-5m5 5-5 5"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
