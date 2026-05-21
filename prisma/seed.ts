import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type Seed = {
  sport: "NFL" | "MLB" | "NBA";
  league: string;
  awayTeam: string;
  awayAbbr: string;
  homeTeam: string;
  homeAbbr: string;
  startOffsetHours: number;
  status?: "UPCOMING" | "LIVE" | "FINAL" | "CANCELED";
  featured?: boolean;
  spreadHome: number;
  spreadHomeOdds: number;
  spreadAwayOdds: number;
  totalPoints: number;
  totalOverOdds: number;
  totalUnderOdds: number;
  moneylineHome: number;
  moneylineAway: number;
  oddsDeltaBps: number;
};

const seeds: Seed[] = [
  {
    sport: "NBA",
    league: "NBA Playoffs",
    awayTeam: "Cleveland Cavaliers",
    awayAbbr: "CLE",
    homeTeam: "New York Knicks",
    homeAbbr: "NYK",
    startOffsetHours: 3,
    featured: true,
    spreadHome: -6.5,
    spreadHomeOdds: -106,
    spreadAwayOdds: -114,
    totalPoints: 216.5,
    totalOverOdds: -108,
    totalUnderOdds: -112,
    moneylineHome: -240,
    moneylineAway: +198,
    oddsDeltaBps: -26,
  },
  {
    sport: "NBA",
    league: "NBA Playoffs",
    awayTeam: "Oklahoma City Thunder",
    awayAbbr: "OKC",
    homeTeam: "San Antonio Spurs",
    homeAbbr: "SAS",
    startOffsetHours: 27,
    featured: true,
    spreadHome: -1.5,
    spreadHomeOdds: -114,
    spreadAwayOdds: -106,
    totalPoints: 215.5,
    totalOverOdds: -114,
    totalUnderOdds: -106,
    moneylineHome: -126,
    moneylineAway: +108,
    oddsDeltaBps: +10,
  },
  {
    sport: "MLB",
    league: "MLB Regular Season",
    awayTeam: "Los Angeles Dodgers",
    awayAbbr: "LAD",
    homeTeam: "San Francisco Giants",
    homeAbbr: "SFG",
    startOffsetHours: 5,
    featured: true,
    spreadHome: +1.5,
    spreadHomeOdds: -170,
    spreadAwayOdds: +145,
    totalPoints: 8.5,
    totalOverOdds: -110,
    totalUnderOdds: -110,
    moneylineHome: +135,
    moneylineAway: -155,
    oddsDeltaBps: +8,
  },
  {
    sport: "MLB",
    league: "MLB Regular Season",
    awayTeam: "New York Yankees",
    awayAbbr: "NYY",
    homeTeam: "Boston Red Sox",
    homeAbbr: "BOS",
    startOffsetHours: 6,
    status: "LIVE",
    spreadHome: +1.5,
    spreadHomeOdds: -160,
    spreadAwayOdds: +140,
    totalPoints: 9.5,
    totalOverOdds: -105,
    totalUnderOdds: -115,
    moneylineHome: +120,
    moneylineAway: -140,
    oddsDeltaBps: -14,
  },
  {
    sport: "MLB",
    league: "MLB Regular Season",
    awayTeam: "Houston Astros",
    awayAbbr: "HOU",
    homeTeam: "Texas Rangers",
    homeAbbr: "TEX",
    startOffsetHours: 30,
    spreadHome: -1.5,
    spreadHomeOdds: +130,
    spreadAwayOdds: -150,
    totalPoints: 8.0,
    totalOverOdds: -110,
    totalUnderOdds: -110,
    moneylineHome: -125,
    moneylineAway: +110,
    oddsDeltaBps: -5,
  },
  {
    sport: "NFL",
    league: "NFL Preseason",
    awayTeam: "Kansas City Chiefs",
    awayAbbr: "KC",
    homeTeam: "Buffalo Bills",
    homeAbbr: "BUF",
    startOffsetHours: 48,
    featured: true,
    spreadHome: -2.5,
    spreadHomeOdds: -110,
    spreadAwayOdds: -110,
    totalPoints: 48.5,
    totalOverOdds: -108,
    totalUnderOdds: -112,
    moneylineHome: -140,
    moneylineAway: +120,
    oddsDeltaBps: +22,
  },
  {
    sport: "NFL",
    league: "NFL Preseason",
    awayTeam: "San Francisco 49ers",
    awayAbbr: "SF",
    homeTeam: "Philadelphia Eagles",
    homeAbbr: "PHI",
    startOffsetHours: 52,
    spreadHome: -3.0,
    spreadHomeOdds: -110,
    spreadAwayOdds: -110,
    totalPoints: 46.5,
    totalOverOdds: -110,
    totalUnderOdds: -110,
    moneylineHome: -160,
    moneylineAway: +140,
    oddsDeltaBps: -9,
  },
  {
    sport: "NFL",
    league: "NFL Preseason",
    awayTeam: "Dallas Cowboys",
    awayAbbr: "DAL",
    homeTeam: "Green Bay Packers",
    homeAbbr: "GB",
    startOffsetHours: 72,
    spreadHome: -1.5,
    spreadHomeOdds: -118,
    spreadAwayOdds: +100,
    totalPoints: 45.0,
    totalOverOdds: -112,
    totalUnderOdds: -108,
    moneylineHome: -125,
    moneylineAway: +106,
    oddsDeltaBps: +3,
  },
];

async function main() {
  const adminEmail = "admin@alohabet.dev";
  const adminPass = "admin1234";
  const adminHash = await bcrypt.hash(adminPass, 10);
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      displayName: "Admin",
      passwordHash: adminHash,
      isAdmin: true,
    },
    update: { isAdmin: true },
  });

  const demoEmail = "demo@alohabet.dev";
  const demoPass = "demo1234";
  const demoHash = await bcrypt.hash(demoPass, 10);
  await prisma.user.upsert({
    where: { email: demoEmail },
    create: {
      email: demoEmail,
      displayName: "Demo Trader",
      passwordHash: demoHash,
    },
    update: {},
  });

  await prisma.match.deleteMany();

  const now = Date.now();
  for (const s of seeds) {
    await prisma.match.create({
      data: {
        sport: s.sport,
        league: s.league,
        awayTeam: s.awayTeam,
        awayAbbr: s.awayAbbr,
        homeTeam: s.homeTeam,
        homeAbbr: s.homeAbbr,
        startTime: new Date(now + s.startOffsetHours * 3600_000),
        status: s.status ?? "UPCOMING",
        featured: s.featured ?? false,
        spreadHome: s.spreadHome,
        spreadHomeOdds: s.spreadHomeOdds,
        spreadAwayOdds: s.spreadAwayOdds,
        totalPoints: s.totalPoints,
        totalOverOdds: s.totalOverOdds,
        totalUnderOdds: s.totalUnderOdds,
        moneylineHome: s.moneylineHome,
        moneylineAway: s.moneylineAway,
        oddsDeltaBps: s.oddsDeltaBps,
      },
    });
  }

  console.log(`Seeded ${seeds.length} matches.`);
  console.log(`Admin: ${adminEmail} / ${adminPass}`);
  console.log(`Demo : ${demoEmail} / ${demoPass}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
