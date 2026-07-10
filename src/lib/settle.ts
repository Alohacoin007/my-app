import { prisma } from "./db";
import type { BetStatus } from "./types";

type SelectionRow = {
  id: string;
  betId: string;
  market: string;
  pick: string;
  line: number | null;
  status: string;
};
type MatchRow = {
  homeScore: number | null;
  awayScore: number | null;
};

function evaluateSelection(sel: SelectionRow, match: MatchRow): BetStatus {
  if (match.homeScore == null || match.awayScore == null) return "PENDING";
  const home = match.homeScore;
  const away = match.awayScore;

  switch (sel.market) {
    case "MONEYLINE":
      if (home === away) return "VOID";
      return (sel.pick === "HOME" ? home > away : away > home) ? "WON" : "LOST";

    case "SPREAD": {
      if (sel.line == null) return "VOID";
      // sel.line is stored from the picked side's perspective:
      // Yankees -1.5 pick stores line = -1.5; Red Sox +1.5 pick stores +1.5.
      const teamScore = sel.pick === "HOME" ? home : away;
      const oppScore = sel.pick === "HOME" ? away : home;
      const adjusted = teamScore + sel.line - oppScore;
      if (adjusted === 0) return "VOID";
      return adjusted > 0 ? "WON" : "LOST";
    }

    case "TOTAL": {
      if (sel.line == null) return "VOID";
      const total = home + away;
      if (total === sel.line) return "VOID";
      const over = total > sel.line;
      return (sel.pick === "OVER" ? over : !over) ? "WON" : "LOST";
    }
    default:
      return "VOID";
  }
}

export async function settleMatch(matchId: string, homeScore: number, awayScore: number) {
  const match = await prisma.match.update({
    where: { id: matchId },
    data: { homeScore, awayScore, status: "FINAL" },
  });

  const selections = await prisma.betSelection.findMany({
    where: { matchId, status: "PENDING" },
    include: { bet: { include: { selections: true } } },
  });

  const betsTouched = new Map<string, true>();

  for (const sel of selections) {
    const result = evaluateSelection(sel, match);
    await prisma.betSelection.update({
      where: { id: sel.id },
      data: { status: result },
    });
    betsTouched.set(sel.betId, true);
  }

  for (const betId of betsTouched.keys()) {
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: { selections: true, user: true },
    });
    if (!bet) continue;
    const statuses = bet.selections.map((s) => s.status);
    if (statuses.includes("PENDING")) continue;
    if (statuses.includes("LOST")) {
      await prisma.bet.update({
        where: { id: bet.id },
        data: { status: "LOST", settledAt: new Date() },
      });
      continue;
    }
    if (statuses.every((s) => s === "VOID")) {
      await prisma.$transaction(async (tx) => {
        await tx.bet.update({
          where: { id: bet.id },
          data: { status: "VOID", settledAt: new Date() },
        });
        await tx.user.update({
          where: { id: bet.userId },
          data: { balanceCents: { increment: bet.stakeCents } },
        });
      });
      continue;
    }
    // WON or mixed WON/VOID → user wins, payout = stake * combined odds (already computed at placement)
    await prisma.$transaction(async (tx) => {
      await tx.bet.update({
        where: { id: bet.id },
        data: { status: "WON", settledAt: new Date() },
      });
      await tx.user.update({
        where: { id: bet.userId },
        data: { balanceCents: { increment: bet.payoutCents } },
      });
    });
  }

  return { matchId, homeScore, awayScore, touched: betsTouched.size };
}
