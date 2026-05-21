import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import {
  formatAmerican,
  formatMoney,
  formatSignedMoney,
  formatSpread,
} from "@/lib/odds";
import { sportBadgeClass } from "@/lib/sports";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await currentUser();
  if (!user) {
    return (
      <main>
        <Hero title="History" subtitle="Log in to view your bet history." />
        <div className="px-5 pt-6">
          <Link
            href="/login?next=/history"
            className="inline-block rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white"
          >
            Log in
          </Link>
        </div>
      </main>
    );
  }

  const bets = await prisma.bet.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      selections: { include: { match: true } },
    },
  });

  const won = bets.filter((b) => b.status === "WON");
  const lost = bets.filter((b) => b.status === "LOST");
  const realized = won.reduce(
    (sum, b) => sum + (b.payoutCents - b.stakeCents),
    0
  ) - lost.reduce((sum, b) => sum + b.stakeCents, 0);

  return (
    <main>
      <Hero title="History" subtitle={`${bets.length} bets · realized ${formatSignedMoney(realized)}`} />

      {bets.length === 0 ? (
        <div className="mx-4 mt-6 rounded-xl border border-dashed border-ink-line bg-surface-soft px-4 py-10 text-center">
          <p className="text-sm font-semibold text-ink-mid">
            No bets yet. Tap any odds on the home screen to start your slip.
          </p>
        </div>
      ) : (
        <ul className="row-divider mt-2">
          {bets.map((b) => (
            <li key={b.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusPill status={b.status} />
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-mid">
                    {b.type === "PARLAY" ? `${b.selections.length}-Leg Parlay` : "Single"}
                  </span>
                </div>
                <span className="text-sm font-bold tabular-nums">
                  {formatAmerican(b.combinedOdds)}
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {b.selections.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 text-[13px]"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`chip ${sportBadgeClass(s.match.sport)}`}>
                        {s.match.sport}
                      </span>
                      <span className="truncate text-ink">
                        {selectionLabel(s)}{" "}
                        <span className="text-ink-mid">
                          · {s.match.awayAbbr}@{s.match.homeAbbr}
                        </span>
                      </span>
                    </div>
                    <span className="font-bold tabular-nums">
                      {formatAmerican(s.americanOdds)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between text-[12px] text-ink-mid">
                <span>
                  Stake{" "}
                  <span className="font-bold text-ink">
                    {formatMoney(b.stakeCents)}
                  </span>
                </span>
                <span>
                  {b.status === "WON"
                    ? "Won"
                    : b.status === "LOST"
                    ? "Lost"
                    : b.status === "VOID"
                    ? "Refund"
                    : "Potential"}{" "}
                  <span
                    className={`font-bold ${
                      b.status === "WON"
                        ? "text-up"
                        : b.status === "LOST"
                        ? "text-down"
                        : "text-ink"
                    }`}
                  >
                    {b.status === "LOST"
                      ? formatSignedMoney(-b.stakeCents)
                      : b.status === "VOID"
                      ? formatMoney(b.stakeCents)
                      : formatMoney(b.payoutCents)}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Hero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="brand-header px-5 py-5">
      <h1 className="text-2xl font-black tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-white/80">{subtitle}</p>
    </header>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "WON"
      ? "bg-up-soft text-up"
      : status === "LOST"
      ? "bg-down-soft text-down"
      : status === "VOID"
      ? "bg-surface-chip text-ink-mid"
      : "bg-surface-chip text-ink";
  return <span className={`chip ${cls}`}>{status}</span>;
}

function selectionLabel(s: {
  market: string;
  pick: string;
  line: number | null;
  match: { homeTeam: string; awayTeam: string };
}) {
  const team = s.pick === "HOME" ? s.match.homeTeam : s.match.awayTeam;
  if (s.market === "MONEYLINE") return team;
  if (s.market === "SPREAD") return `${team} ${formatSpread(s.line)}`;
  return `${s.pick === "OVER" ? "Over" : "Under"} ${s.line}`;
}
