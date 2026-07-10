import Link from "next/link";
import { fakeMatchTicker, sportBadgeClass } from "@/lib/sports";
import { formatAmerican, formatPct } from "@/lib/odds";

type Match = {
  id: string;
  sport: string;
  league: string;
  homeTeam: string;
  homeAbbr: string;
  awayTeam: string;
  awayAbbr: string;
  startTime: Date;
  status: string;
  moneylineHome: number | null;
  moneylineAway: number | null;
  oddsDeltaBps: number;
};

export function GameRow({ match }: { match: Match }) {
  const ticker = fakeMatchTicker(match.id);
  const isLive = match.status === "LIVE";
  const isFinal = match.status === "FINAL";
  const delta = match.oddsDeltaBps ?? 0;
  const up = delta >= 0;

  // pick the headline "price" — moneyline for the away team, like a tradable underdog quote
  const price = match.moneylineAway ?? match.moneylineHome ?? 0;
  const lowOdds = Math.min(match.moneylineHome ?? 0, match.moneylineAway ?? 0);
  const highOdds = Math.max(match.moneylineHome ?? 0, match.moneylineAway ?? 0);

  return (
    <Link
      href={`/games/${match.id}`}
      className="flex items-center justify-between gap-3 px-4 py-3 active:bg-surface-soft"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-extrabold tracking-tight text-ink">{ticker}</span>
          <span className={`chip ${sportBadgeClass(match.sport)}`}>{match.sport}</span>
        </div>
        <p className="mt-0.5 truncate text-[13px] text-ink-mid">
          {match.awayAbbr} @ {match.homeAbbr} · {match.league}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-soft">
          {isLive ? (
            <>
              <span className="dot-live" />
              <span className="font-semibold text-up">LIVE</span>
            </>
          ) : isFinal ? (
            <>
              <span className="dot-pre" />
              <span>FINAL</span>
            </>
          ) : (
            <>
              <span className="dot-pre" />
              <span>{formatStartTime(match.startTime)}</span>
            </>
          )}
          <span className="ml-1 text-ink-soft">{ticker.length}</span>
        </div>
      </div>

      <div className="flex flex-col items-end">
        <div className="font-extrabold tabular-nums text-ink">
          {formatAmerican(price)}
        </div>
        <div className="mt-0.5 text-[11px] tabular-nums text-ink-soft">
          L {formatAmerican(lowOdds)} · H {formatAmerican(highOdds)}
        </div>
      </div>

      <div
        className={`min-w-[64px] text-right text-sm font-bold tabular-nums ${
          up ? "text-up" : "text-down"
        }`}
      >
        {formatPct(delta)}
      </div>
    </Link>
  );
}

function formatStartTime(t: Date): string {
  const date = new Date(t);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `Today ${time}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTmrw =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate();
  if (isTmrw) return `Tmrw ${time}`;
  return `${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} ${time}`;
}
