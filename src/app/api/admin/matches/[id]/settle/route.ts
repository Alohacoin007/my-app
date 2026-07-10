import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { settleMatch } from "@/lib/settle";

const Schema = z.object({
  homeScore: z.number().int().min(0).max(300),
  awayScore: z.number().int().min(0).max(300),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const result = await settleMatch(
    params.id,
    parsed.data.homeScore,
    parsed.data.awayScore
  );
  return NextResponse.json({ ok: true, ...result });
}
