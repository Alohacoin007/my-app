"use client";

import { MARKET_LABELS, MATCHES, type Match, type MarketKey, type Selection } from "@/lib/data";

interface Props {
  selections: Selection[];
  onToggle: (sel: Selection) => void;
}

const MARKETS: MarketKey[] = ["home", "draw", "away"];

function Movement({ dir }: { dir: -1 | 0 | 1 }) {
  if (dir === 0) return null;
  return (
    <span
      className="text-[10px] leading-none"
      style={{ color: dir > 0 ? "var(--color-up)" : "var(--color-down)" }}
      aria-label={dir > 0 ? "Odds up" : "Odds down"}
    >
      {dir > 0 ? "▲" : "▼"}
    </span>
  );
}

function OddsButton({
  match,
  market,
  selected,
  onToggle,
}: {
  match: Match;
  market: MarketKey;
  selected: boolean;
  onToggle: Props["onToggle"];
}) {
  const odds = match.odds[market];
  // 무승부 마켓이 없는 종목(KBO/NBA)은 자리만 비워 3열 정렬을 유지
  if (odds === 0) return <div aria-hidden />;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() =>
        onToggle({
          id: `${match.id}:${market}`,
          matchId: match.id,
          matchLabel: `${match.home} vs ${match.away}`,
          market,
          marketLabel: MARKET_LABELS[market],
          odds,
        })
      }
      className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-xs transition-colors ${
        selected
          ? "border-series-1 bg-series-1/15 text-ink"
          : "border-hairline bg-surface-2 text-ink-2 hover:border-ink-muted"
      }`}
    >
      <span className="text-[10px] text-ink-muted">{MARKET_LABELS[market]}</span>
      <span className="flex items-center gap-1 font-semibold tabular-nums text-ink">
        {odds.toFixed(2)}
        <Movement dir={match.movement[market]} />
      </span>
    </button>
  );
}

/** 경기별 승/무/패 배당판. 배당 버튼을 누르면 베팅 슬립에 담긴다. */
export default function LiveOddsBoard({ selections, onToggle }: Props) {
  const selectedIds = new Set(selections.map((s) => s.id));
  return (
    <ul className="divide-y divide-hairline">
      {MATCHES.map((m) => (
        <li key={m.id} className="px-3 py-2.5">
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ink-muted">
              {m.league}
            </span>
            <span className="truncate text-xs font-medium text-ink">
              {m.home} <span className="text-ink-muted">vs</span> {m.away}
            </span>
            <span className="ml-auto shrink-0 text-[10px] tabular-nums text-ink-muted">
              {m.kickoff}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MARKETS.map((market) => (
              <OddsButton
                key={market}
                match={m}
                market={market}
                selected={selectedIds.has(`${m.id}:${market}`)}
                onToggle={onToggle}
              />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
