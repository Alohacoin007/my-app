import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney, formatSignedMoney } from "@/lib/odds";
import { LogoutButton } from "./LogoutButton";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");

  const bets = await prisma.bet.findMany({
    where: { userId: user.id },
    select: { status: true, stakeCents: true, payoutCents: true },
  });
  const pending = bets.filter((b) => b.status === "PENDING");
  const open = pending.reduce(
    (sum, b) => sum + (b.payoutCents - b.stakeCents),
    0
  );
  const realized = bets.reduce((sum, b) => {
    if (b.status === "WON") return sum + (b.payoutCents - b.stakeCents);
    if (b.status === "LOST") return sum - b.stakeCents;
    return sum;
  }, 0);

  return (
    <main>
      <header className="brand-header px-5 py-6">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">
          Account
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">
          {user.displayName}
        </h1>
        <p className="text-sm text-white/80">{user.email}</p>
      </header>

      <section className="px-4 pt-5">
        <Stat label="Balance" value={formatMoney(user.balanceCents)} big />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat
            label="Open P/L"
            value={formatSignedMoney(open)}
            tone={open >= 0 ? "up" : "down"}
          />
          <Stat
            label="Realized"
            value={formatSignedMoney(realized)}
            tone={realized >= 0 ? "up" : "down"}
          />
        </div>
      </section>

      <section className="mt-6 px-4">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-mid">
          Navigate
        </h2>
        <ul className="mt-2 divide-y divide-ink-line rounded-xl border border-ink-line bg-white">
          <NavItem href="/history" label="Bet history" />
          {user.isAdmin && <NavItem href="/admin" label="Admin · matches & settle" />}
        </ul>
      </section>

      <section className="mt-6 px-4">
        <LogoutButton />
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
  big?: boolean;
}) {
  return (
    <div className="rounded-xl border border-ink-line bg-white px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-mid">
        {label}
      </p>
      <p
        className={`mt-1 tabular-nums font-black tracking-tight ${
          big ? "text-2xl" : "text-lg"
        } ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink"}`}
      >
        {value}
      </p>
    </div>
  );
}

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-ink"
      >
        {label}
        <span className="text-ink-soft">›</span>
      </Link>
    </li>
  );
}
