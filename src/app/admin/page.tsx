import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SettleForm } from "./SettleForm";
import { formatSpread } from "@/lib/odds";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin");
  if (!user.isAdmin) redirect("/");

  const matches = await prisma.match.findMany({
    orderBy: [{ status: "asc" }, { startTime: "asc" }],
  });

  return (
    <main>
      <header className="brand-header px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">
          Admin
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Matches</h1>
      </header>

      <section className="px-4 pt-4">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-mid">
          Open & live
        </h2>
        <ul className="mt-2 divide-y divide-ink-line rounded-xl border border-ink-line bg-white">
          {matches
            .filter((m) => m.status !== "FINAL" && m.status !== "CANCELED")
            .map((m) => (
              <li key={m.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-ink">
                      {m.awayAbbr} @ {m.homeAbbr}{" "}
                      <span className="ml-1 text-[11px] font-semibold uppercase text-ink-mid">
                        {m.sport}
                      </span>
                    </p>
                    <p className="text-[12px] text-ink-mid">
                      Spread {m.awayAbbr} {formatSpread(
                        m.spreadHome != null ? -m.spreadHome : null
                      )}{" "}
                      · {m.homeAbbr} {formatSpread(m.spreadHome)} · O/U{" "}
                      {m.totalPoints ?? "—"}
                    </p>
                  </div>
                  <span className="text-[11px] font-bold uppercase text-ink-mid">
                    {m.status}
                  </span>
                </div>
                <SettleForm matchId={m.id} />
              </li>
            ))}
        </ul>
      </section>

      <section className="px-4 pt-6">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-mid">
          Settled
        </h2>
        <ul className="mt-2 divide-y divide-ink-line rounded-xl border border-ink-line bg-white">
          {matches
            .filter((m) => m.status === "FINAL")
            .map((m) => (
              <li key={m.id} className="px-4 py-3 text-[13px]">
                <span className="font-bold">
                  {m.awayAbbr} {m.awayScore} @ {m.homeScore} {m.homeAbbr}
                </span>
                <span className="ml-2 text-ink-mid">{m.sport}</span>
              </li>
            ))}
          {matches.filter((m) => m.status === "FINAL").length === 0 && (
            <li className="px-4 py-4 text-[13px] text-ink-mid">No final games yet.</li>
          )}
        </ul>
      </section>
    </main>
  );
}
