import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { combineAmerican, payoutCents } from "@/lib/odds";

const SelectionSchema = z.object({
  matchId: z.string().min(1),
  market: z.enum(["MONEYLINE", "SPREAD", "TOTAL"]),
  pick: z.enum(["HOME", "AWAY", "OVER", "UNDER"]),
  line: z.number().nullable(),
  americanOdds: z.number().int(),
});

const BodySchema = z.object({
  stakeCents: z.number().int().positive().max(100_000_000),
  selections: z.array(SelectionSchema).min(1).max(10),
});

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { stakeCents, selections } = parsed.data;

  if (user.balanceCents < stakeCents) {
    return NextResponse.json(
      { error: "INSUFFICIENT_FUNDS", message: "Not enough balance." },
      { status: 400 }
    );
  }

  // Validate matches exist and are bettable (UPCOMING or LIVE).
  const matches = await prisma.match.findMany({
    where: { id: { in: selections.map((s) => s.matchId) } },
  });
  if (matches.length !== selections.length) {
    return NextResponse.json(
      { error: "MATCH_NOT_FOUND", message: "One or more matches no longer exist." },
      { status: 400 }
    );
  }
  const closed = matches.find((m) => m.status === "FINAL" || m.status === "CANCELED");
  if (closed) {
    return NextResponse.json(
      { error: "MATCH_CLOSED", message: `${closed.awayAbbr}@${closed.homeAbbr} is no longer accepting bets.` },
      { status: 400 }
    );
  }

  // Disallow multiple selections from the same match within a parlay.
  if (selections.length > 1) {
    const ids = new Set<string>();
    for (const s of selections) {
      if (ids.has(s.matchId)) {
        return NextResponse.json(
          {
            error: "RELATED_SELECTIONS",
            message: "Parlays cannot include two picks from the same game.",
          },
          { status: 400 }
        );
      }
      ids.add(s.matchId);
    }
  }

  const combinedOdds = combineAmerican(selections.map((s) => s.americanOdds));
  const payout = payoutCents(stakeCents, combinedOdds);

  const bet = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { balanceCents: { decrement: stakeCents } },
    });
    return tx.bet.create({
      data: {
        userId: user.id,
        stakeCents,
        payoutCents: payout,
        combinedOdds,
        type: selections.length > 1 ? "PARLAY" : "SINGLE",
        selections: {
          create: selections.map((s) => ({
            matchId: s.matchId,
            market: s.market,
            pick: s.pick,
            line: s.line ?? null,
            americanOdds: s.americanOdds,
          })),
        },
      },
      include: { selections: true },
    });
  });

  return NextResponse.json({ ok: true, betId: bet.id });
}
