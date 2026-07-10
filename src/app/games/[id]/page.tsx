import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { OddsButton } from "@/components/OddsButton";
import { formatAmerican, formatPct, formatSpread } from "@/lib/odds";
import { sportBadgeClass, fakeMatchTicker } from "@/lib/sports";

export const dynamic = "force-dynamic";

export default async function GameDetail({
  params,
}: {
  params: { id: string };
}) {
  const match = await prisma.match.findUnique({ where: { id: params.id } });
  if (!match) return notFound();
  const user = await currentUser();

  const ticker = fakeMatchTicker(match.id);
  const matchLabel = `${match.awayTeam} @ ${match.homeTeam}`;
  const delta = match.oddsDeltaBps ?? 0;
  const up = delta >= 0;

  return (
    <main>
      <header className="brand-header px-5 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-1 text-sm font-bold">
            <BackIcon /> Back
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
            {match.league}
          </span>
          <span className="w-8" />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[22px] font-black tracking-tight">{ticker}</span>
          <span className={`chip ${sportBadgeClass(match.sport)}`}>{match.sport}</span>
          <span
            className={`ml-auto rounded-md px-2 py-1 text-sm font-bold ${
              up ? "bg-up-soft text-up" : "bg-down-soft text-down"
            }`}
          >
            {formatPct(delta)}
          </span>
        </div>
        <p className="mt-1 text-[15px] font-semibold text-white/90">
          {match.awayTeam} <span className="text-white/60">vs</span> {match.homeTeam}
        </p>
        <p className="mt-0.5 text-[12px] text-white/70">
          {new Date(match.startTime).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          {match.status === "LIVE" && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-up/20 px-2 py-0.5 text-[10px] font-bold text-up">
              <span className="dot-live" /> LIVE
            </span>
          )}
        </p>
      </header>

      <section className="px-4 pt-5">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-mid">
          Game Lines
        </h2>

        <div className="mt-2 grid grid-cols-[1fr_repeat(3,1fr)] gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-ink-mid">
          <span />
          <span className="text-center">Spread</span>
          <span className="text-center">Total</span>
          <span className="text-center">Money</span>
        </div>

        <Row
          team={match.awayTeam}
          matchId={match.id}
          matchLabel={matchLabel}
          isHome={false}
          spread={match.spreadHome != null ? -match.spreadHome : null}
          spreadOdds={match.spreadAwayOdds}
          totalLine={match.totalPoints}
          totalLabel="O"
          totalOdds={match.totalOverOdds}
          moneyOdds={match.moneylineAway}
        />
        <Row
          team={match.homeTeam}
          matchId={match.id}
          matchLabel={matchLabel}
          isHome={true}
          spread={match.spreadHome}
          spreadOdds={match.spreadHomeOdds}
          totalLine={match.totalPoints}
          totalLabel="U"
          totalOdds={match.totalUnderOdds}
          moneyOdds={match.moneylineHome}
        />
      </section>

      {!user && (
        <div className="mx-4 mt-6 rounded-xl border border-ink-line bg-surface-soft px-4 py-3 text-[13px] text-ink-mid">
          <Link href="/login" className="font-bold text-brand">
            Log in
          </Link>{" "}
          to place bets with your virtual bankroll.
        </div>
      )}

      <section className="px-4 pt-6">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-mid">
          Quote Tape
        </h2>
        <div className="mt-2 rounded-xl border border-ink-line bg-white">
          <Quote label={`${match.awayAbbr} ML`} value={formatAmerican(match.moneylineAway)} />
          <Quote label={`${match.homeAbbr} ML`} value={formatAmerican(match.moneylineHome)} />
          <Quote
            label={`Spread`}
            value={`${match.awayAbbr} ${formatSpread(
              match.spreadHome != null ? -match.spreadHome : null
            )} · ${match.homeAbbr} ${formatSpread(match.spreadHome)}`}
          />
          <Quote
            label={`Total`}
            value={`O/U ${match.totalPoints ?? "—"}`}
            last
          />
        </div>
      </section>
    </main>
  );
}

function Row({
  team,
  matchId,
  matchLabel,
  isHome,
  spread,
  spreadOdds,
  totalLine,
  totalLabel,
  totalOdds,
  moneyOdds,
}: {
  team: string;
  matchId: string;
  matchLabel: string;
  isHome: boolean;
  spread: number | null;
  spreadOdds: number | null;
  totalLine: number | null;
  totalLabel: "O" | "U";
  totalOdds: number | null;
  moneyOdds: number | null;
}) {
  return (
    <div className="mt-2 grid grid-cols-[1fr_repeat(3,1fr)] items-stretch gap-2">
      <div className="flex items-center pr-1 text-[14px] font-bold leading-tight text-ink">
        {team}
      </div>
      <OddsButton
        matchId={matchId}
        matchLabel={matchLabel}
        pickLabel={`${team} ${formatSpread(spread)}`}
        market="SPREAD"
        pick={isHome ? "HOME" : "AWAY"}
        line={spread}
        americanOdds={spreadOdds}
        topLine={formatSpread(spread)}
      />
      <OddsButton
        matchId={matchId}
        matchLabel={matchLabel}
        pickLabel={`${totalLabel === "O" ? "Over" : "Under"} ${totalLine ?? ""}`}
        market="TOTAL"
        pick={totalLabel === "O" ? "OVER" : "UNDER"}
        line={totalLine}
        americanOdds={totalOdds}
        topLine={`${totalLabel} ${totalLine ?? "—"}`}
      />
      <OddsButton
        matchId={matchId}
        matchLabel={matchLabel}
        pickLabel={team}
        market="MONEYLINE"
        pick={isHome ? "HOME" : "AWAY"}
        line={null}
        americanOdds={moneyOdds}
      />
    </div>
  );
}

function Quote({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 ${
        last ? "" : "border-b border-ink-line"
      }`}
    >
      <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-mid">
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="m15 6-6 6 6 6"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
