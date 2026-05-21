import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";

const Schema = z.object({
  sport: z.enum(["NFL", "MLB", "NBA"]),
  league: z.string().min(1),
  homeTeam: z.string().min(1),
  homeAbbr: z.string().min(1).max(5),
  awayTeam: z.string().min(1),
  awayAbbr: z.string().min(1).max(5),
  startTime: z.string().datetime(),
  featured: z.boolean().optional(),
  spreadHome: z.number().nullable().optional(),
  spreadHomeOdds: z.number().int().nullable().optional(),
  spreadAwayOdds: z.number().int().nullable().optional(),
  totalPoints: z.number().nullable().optional(),
  totalOverOdds: z.number().int().nullable().optional(),
  totalUnderOdds: z.number().int().nullable().optional(),
  moneylineHome: z.number().int().nullable().optional(),
  moneylineAway: z.number().int().nullable().optional(),
});

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const d = parsed.data;
  const match = await prisma.match.create({
    data: { ...d, startTime: new Date(d.startTime) },
  });
  return NextResponse.json({ ok: true, id: match.id });
}
