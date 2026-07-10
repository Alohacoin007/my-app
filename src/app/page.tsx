import { prisma } from "@/lib/db";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { SportTabs } from "@/components/SportTabs";
import { GameRow } from "@/components/GameRow";
import { PromoCard } from "@/components/PromoCard";
import { currentUser } from "@/lib/auth";
import type { Sport } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParams = { tab?: string; q?: string };

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await currentUser();
  const tab = (searchParams.tab ?? "ALL").toUpperCase();
  const q = (searchParams.q ?? "").trim();

  const all = await prisma.match.findMany({
    orderBy: [{ status: "asc" }, { startTime: "asc" }],
  });

  const matched = q
    ? all.filter((m) =>
        [m.homeTeam, m.awayTeam, m.homeAbbr, m.awayAbbr, m.league]
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase())
      )
    : all;

  const filtered =
    tab === "ALL" || tab === "FAV"
      ? matched
      : matched.filter((m) => m.sport === (tab as Sport));

  const counts = {
    ALL: matched.length,
    FAV: 0,
    NFL: matched.filter((m) => m.sport === "NFL").length,
    MLB: matched.filter((m) => m.sport === "MLB").length,
    NBA: matched.filter((m) => m.sport === "NBA").length,
  };

  const pnl = await openPnlCents(user?.id);

  return (
    <main>
      <Header
        balanceCents={user?.balanceCents ?? 300000000}
        pnlCents={pnl}
        freeCents={user?.balanceCents ?? 300000000}
        isAuthed={!!user}
      />

      <div className="-mt-3 pt-3">
        <div className="py-3">
          <SearchBar initial={q} />
        </div>

        <SportTabs
          active={tab}
          tabs={[
            { key: "FAV", label: "Favorites", count: counts.FAV },
            { key: "NFL", label: "NFL", count: counts.NFL },
            { key: "MLB", label: "MLB", count: counts.MLB },
            { key: "NBA", label: "NBA", count: counts.NBA },
          ]}
        />

        <div className="mt-5 px-4">
          <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-ink-mid">
            <FireIcon />
            Trending Today
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState q={q} />
        ) : (
          <ul className="row-divider mt-2">
            {filtered.map((m) => (
              <li key={m.id}>
                <GameRow match={m} />
              </li>
            ))}
          </ul>
        )}

        <PromoCard isAuthed={!!user} />
      </div>
    </main>
  );
}

async function openPnlCents(userId?: string | null): Promise<number> {
  if (!userId) return 0;
  const bets = await prisma.bet.findMany({
    where: { userId, status: "PENDING" },
    select: { stakeCents: true, payoutCents: true },
  });
  // optimistic open P/L = potential profit if all open bets won, capped purely visual
  return bets.reduce((sum, b) => sum + (b.payoutCents - b.stakeCents), 0);
}

function EmptyState({ q }: { q: string }) {
  return (
    <div className="mx-4 mt-6 rounded-xl border border-dashed border-ink-line bg-surface-soft px-4 py-10 text-center">
      <p className="text-sm font-semibold text-ink-mid">
        {q ? `No matches for "${q}".` : "No games yet — check back soon."}
      </p>
    </div>
  );
}

function FireIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3s4 4 4 8a4 4 0 1 1-8 0c0-1 .5-2 1-3 0 0 0 3 2 3 0-3-1-5 1-8Z"
        stroke="#f59e0b"
        fill="#fde68a"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
