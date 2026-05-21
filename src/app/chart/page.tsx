import Link from "next/link";
import { prisma } from "@/lib/db";
import { fakeMatchTicker, sportBadgeClass } from "@/lib/sports";
import { formatAmerican, formatPct } from "@/lib/odds";

export const dynamic = "force-dynamic";

export default async function ChartPage() {
  const matches = await prisma.match.findMany({
    where: { status: { in: ["UPCOMING", "LIVE"] } },
    orderBy: [{ status: "asc" }, { startTime: "asc" }],
    take: 20,
  });

  return (
    <main>
      <header className="brand-header px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">
          Tape
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Odds Movement</h1>
        <p className="mt-1 text-sm text-white/80">
          Open-to-current price change for tradeable lines.
        </p>
      </header>

      <ul className="row-divider mt-2">
        {matches.map((m) => {
          const up = (m.oddsDeltaBps ?? 0) >= 0;
          return (
            <li key={m.id}>
              <Link
                href={`/games/${m.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-extrabold">{fakeMatchTicker(m.id)}</span>
                  <span className={`chip ${sportBadgeClass(m.sport)}`}>
                    {m.sport}
                  </span>
                  <span className="truncate text-[12px] text-ink-mid">
                    {m.awayAbbr}@{m.homeAbbr}
                  </span>
                </div>
                <div className="text-right">
                  <p className="font-bold tabular-nums">
                    {formatAmerican(m.moneylineAway)} ·{" "}
                    {formatAmerican(m.moneylineHome)}
                  </p>
                  <p
                    className={`text-[11px] font-bold tabular-nums ${
                      up ? "text-up" : "text-down"
                    }`}
                  >
                    {formatPct(m.oddsDeltaBps ?? 0)}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
