import Link from "next/link";
import { prisma } from "@/lib/db";
import { GameRow } from "@/components/GameRow";

export const dynamic = "force-dynamic";

export default async function TradePage() {
  const featured = await prisma.match.findMany({
    where: { OR: [{ featured: true }, { status: "LIVE" }] },
    orderBy: [{ status: "asc" }, { startTime: "asc" }],
  });

  return (
    <main>
      <header className="brand-header px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">
          Trade
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Featured Lines</h1>
        <p className="mt-1 text-sm text-white/80">
          Hand-picked games with the most action.
        </p>
      </header>

      {featured.length === 0 ? (
        <div className="mx-4 mt-6 rounded-xl border border-dashed border-ink-line bg-surface-soft px-4 py-10 text-center text-sm text-ink-mid">
          No featured games right now —{" "}
          <Link href="/" className="font-bold text-brand">
            browse all
          </Link>
          .
        </div>
      ) : (
        <ul className="row-divider mt-2">
          {featured.map((m) => (
            <li key={m.id}>
              <GameRow match={m} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
