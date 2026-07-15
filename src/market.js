// ALPEXA — mock market data + tick simulator
// Symbols across asset classes; each ticks at 250-600ms with mean-reverting jitter.

const SYMBOLS = [
  // ─── FX (10) — majors, minors, metals ───
  { sym:'EURUSD', name:'Euro / US Dollar',         cls:'FX',     bid: 1.08412, digits: 5, spread: 0.00008, vol24: '142.3B' },
  { sym:'GBPUSD', name:'British Pound / USD',      cls:'FX',     bid: 1.26834, digits: 5, spread: 0.00010, vol24: '84.1B'  },
  { sym:'USDJPY', name:'US Dollar / Yen',          cls:'FX',     bid: 156.342, digits: 3, spread: 0.012,   vol24: '128.7B' },
  { sym:'AUDUSD', name:'Australian / US Dollar',   cls:'FX',     bid: 0.66124, digits: 5, spread: 0.00012, vol24: '42.1B'  },
  { sym:'USDCHF', name:'US Dollar / Swiss Franc',  cls:'FX',     bid: 0.91024, digits: 5, spread: 0.00010, vol24: '38.5B'  },
  { sym:'USDCAD', name:'US Dollar / Canadian',     cls:'FX',     bid: 1.36420, digits: 5, spread: 0.00012, vol24: '41.8B'  },
  { sym:'NZDUSD', name:'New Zealand / US Dollar',  cls:'FX',     bid: 0.60315, digits: 5, spread: 0.00014, vol24: '12.4B'  },
  { sym:'EURJPY', name:'Euro / Japanese Yen',      cls:'FX',     bid: 169.580, digits: 3, spread: 0.015,   vol24: '32.6B'  },
  { sym:'XAUUSD', name:'Gold Spot',                cls:'FX',     bid: 2348.15, digits: 2, spread: 0.18,    vol24: '52.4B'  },
  { sym:'XAGUSD', name:'Silver Spot',              cls:'FX',     bid: 30.420,  digits: 3, spread: 0.018,   vol24: '8.7B'   },

  // ─── STOCK (10) — US large caps ───
  { sym:'AAPL',   name:'Apple Inc.',               cls:'STOCK',  bid: 218.74,  digits: 2, spread: 0.03,    vol24: '8.2B'   },
  { sym:'TSLA',   name:'Tesla Inc.',               cls:'STOCK',  bid: 247.31,  digits: 2, spread: 0.04,    vol24: '12.6B'  },
  { sym:'NVDA',   name:'NVIDIA Corp.',             cls:'STOCK',  bid: 924.18,  digits: 2, spread: 0.07,    vol24: '18.4B'  },
  { sym:'MSFT',   name:'Microsoft Corp.',          cls:'STOCK',  bid: 418.52,  digits: 2, spread: 0.04,    vol24: '7.1B'   },
  { sym:'GOOGL',  name:'Alphabet Inc. Class A',    cls:'STOCK',  bid: 172.85,  digits: 2, spread: 0.03,    vol24: '4.8B'   },
  { sym:'META',   name:'Meta Platforms Inc.',      cls:'STOCK',  bid: 478.30,  digits: 2, spread: 0.05,    vol24: '5.6B'   },
  { sym:'AMZN',   name:'Amazon.com Inc.',          cls:'STOCK',  bid: 184.20,  digits: 2, spread: 0.04,    vol24: '6.3B'   },
  { sym:'NFLX',   name:'Netflix Inc.',             cls:'STOCK',  bid: 624.18,  digits: 2, spread: 0.06,    vol24: '2.1B'   },
  { sym:'AMD',    name:'Advanced Micro Devices',   cls:'STOCK',  bid: 158.72,  digits: 2, spread: 0.03,    vol24: '4.2B'   },
  { sym:'JPM',    name:'JPMorgan Chase & Co.',     cls:'STOCK',  bid: 204.36,  digits: 2, spread: 0.04,    vol24: '2.8B'   },

  // ─── CRYPTO (10) ───
  { sym:'BTCUSD', name:'Bitcoin',                  cls:'CRYPTO', bid: 71284.6, digits: 1, spread: 4.5,     vol24: '38.2B'  },
  { sym:'ETHUSD', name:'Ethereum',                 cls:'CRYPTO', bid: 3842.18, digits: 2, spread: 0.65,    vol24: '14.8B'  },
  { sym:'SOLUSD', name:'Solana',                   cls:'CRYPTO', bid: 172.41,  digits: 2, spread: 0.08,    vol24: '3.4B'   },
  { sym:'XRPUSD', name:'XRP',                      cls:'CRYPTO', bid: 0.5184,  digits: 4, spread: 0.0008,  vol24: '2.1B'   },
  { sym:'ADAUSD', name:'Cardano',                  cls:'CRYPTO', bid: 0.4625,  digits: 4, spread: 0.0006,  vol24: '0.9B'   },
  { sym:'DOGEUSD',name:'Dogecoin',                 cls:'CRYPTO', bid: 0.1542,  digits: 4, spread: 0.0004,  vol24: '1.6B'   },
  { sym:'BNBUSD', name:'BNB',                      cls:'CRYPTO', bid: 592.18,  digits: 2, spread: 0.18,    vol24: '1.8B'   },
  { sym:'DOTUSD', name:'Polkadot',                 cls:'CRYPTO', bid: 7.842,   digits: 3, spread: 0.012,   vol24: '0.4B'   },
  { sym:'AVAXUSD',name:'Avalanche',                cls:'CRYPTO', bid: 36.420,  digits: 3, spread: 0.025,   vol24: '0.7B'   },
  { sym:'LINKUSD',name:'Chainlink',                cls:'CRYPTO', bid: 14.820,  digits: 3, spread: 0.014,   vol24: '0.5B'   },

  // ─── INDEX (10) — major equity indices + WTI ───
  { sym:'NAS100', name:'NASDAQ 100',               cls:'INDEX',  bid: 18742.5, digits: 1, spread: 1.2,     vol24: '—'      },
  { sym:'SPX500', name:'S&P 500',                  cls:'INDEX',  bid: 5318.6,  digits: 1, spread: 0.5,     vol24: '—'      },
  { sym:'US30',   name:'Dow Jones 30',             cls:'INDEX',  bid: 39842.5, digits: 1, spread: 2.0,     vol24: '—'      },
  { sym:'GER40',  name:'DAX 40',                   cls:'INDEX',  bid: 18712.4, digits: 1, spread: 1.2,     vol24: '—'      },
  { sym:'UK100',  name:'FTSE 100',                 cls:'INDEX',  bid: 8412.5,  digits: 1, spread: 0.7,     vol24: '—'      },
  { sym:'JPN225', name:'Nikkei 225',               cls:'INDEX',  bid: 38912,   digits: 0, spread: 5,       vol24: '—'      },
  { sym:'HK50',   name:'Hang Seng 50',             cls:'INDEX',  bid: 19245.8, digits: 1, spread: 3.0,     vol24: '—'      },
  { sym:'AUS200', name:'ASX 200',                  cls:'INDEX',  bid: 7842.5,  digits: 1, spread: 1.5,     vol24: '—'      },
  { sym:'EUSTX50',name:'Euro Stoxx 50',            cls:'INDEX',  bid: 5018.4,  digits: 1, spread: 0.8,     vol24: '—'      },
  { sym:'WTI',    name:'Crude Oil (WTI)',          cls:'INDEX',  bid: 78.42,   digits: 2, spread: 0.03,    vol24: '4.1B'   },
];

// Persistent state per symbol (price walks)
function createMarket() {
  const state = SYMBOLS.map(s => ({
    ...s,
    last: s.bid,
    open: s.bid * (1 + (Math.random()-0.5)*0.006),
    high: s.bid * 1.004,
    low:  s.bid * 0.996,
    chgPct: (Math.random()-0.5) * 2,
    series: genSeries(s.bid, 60),
    flash: null, // 'up' | 'down' | null
    baseSpread: s.spread,
    spreadFlash: null, // 'wide' | 'tight' | null
  }));

  function tick() {
    state.forEach((s, i) => {
      const stepScale = s.cls === 'CRYPTO' ? 0.0008 : s.cls === 'STOCK' ? 0.0006 : 0.0002;
      const drift = (Math.random() - 0.5) * 2 * stepScale;
      const meanRev = (s.bid - s.last) / s.bid * 0.05;
      const pct = drift + meanRev;
      const next = s.last * (1 + pct);
      s.flash = next > s.last ? 'up' : next < s.last ? 'down' : null;
      s.last = next;
      if (next > s.high) s.high = next;
      if (next < s.low)  s.low  = next;
      s.chgPct = ((next - s.open) / s.open) * 100;

      // Floating spread — random walk around baseSpread, with occasional spikes.
      // Clamp between 0.4x and 3.5x of base; reverts toward base.
      const prev = s.spread;
      const spike = Math.random() < 0.04 ? (0.7 + Math.random()*1.8) : 1;
      const noise = 1 + (Math.random() - 0.5) * 0.35;
      const revert = 0.18 * (s.baseSpread - prev) / s.baseSpread;
      let nextSpread = prev * noise * spike * (1 + revert);
      nextSpread = Math.max(s.baseSpread * 0.4, Math.min(s.baseSpread * 3.5, nextSpread));
      s.spreadFlash = Math.abs(nextSpread - prev) / s.baseSpread > 0.12
        ? (nextSpread > prev ? 'wide' : 'tight') : null;
      s.spread = nextSpread;

      // push to series (last candle's close)
      const cur = s.series[s.series.length - 1];
      cur.c = next;
      if (next > cur.h) cur.h = next;
      if (next < cur.l) cur.l = next;
    });
    return state;
  }
  return { state, tick };
}

function genSeries(base, n) {
  let p = base * (1 - 0.008);
  const arr = [];
  for (let i = 0; i < n; i++) {
    const o = p;
    const dir = Math.random() > 0.48 ? 1 : -1;
    const range = base * (0.0008 + Math.random()*0.0018);
    const c = o + dir * range * (0.3 + Math.random()*0.9);
    const h = Math.max(o, c) + range * Math.random() * 0.6;
    const l = Math.min(o, c) - range * Math.random() * 0.6;
    const v = 0.3 + Math.random() * 0.7;
    arr.push({ o, h, l, c, v });
    p = c;
  }
  return arr;
}

// Format helper
function fmt(n, digits) {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// Sample positions / orders
const POSITIONS = [];

const HISTORY = [];

const NEWS = [
  { t:'09:42', tag:'CRYPTO',  ttl:'BTC breaks 71.2K as ETF inflows accelerate',          body:'US spot ETFs added +$560M yesterday. Risk-on bid after NVDA earnings.',  impact:'high' },
  { t:'09:18', tag:'FX',      ttl:'DXY at 104.4, flat ahead of May FOMC minutes',         body:'PPI cooled but June-cut bets weakened on hawkish Fed-speak.',            impact:'med'  },
  { t:'08:55', tag:'METAL',   ttl:'Gold reclaims $2,350 on renewed Middle East risk',    body:'Iran-Israel tensions resurface, safe-haven demand. XAUUSD pressing higher.', impact:'med'  },
  { t:'08:30', tag:'US',      ttl:'US weekly jobless claims 221K, in line with forecast',body:'Labor market gradually softening. S&P futures +0.18%, 10Y at 4.36%.',     impact:'low'  },
  { t:'07:48', tag:'EARNINGS',ttl:'NVDA earnings D-7, consensus +24% beat expected',     body:'Data-center revenue est. $21.1B. Options IV spiking.',                   impact:'med'  },
];

const CALENDAR = [
  { time:'14:30', ccy:'USD', ttl:'Initial Jobless Claims',   fcst:'220K', prev:'231K', impact:3 },
  { time:'14:30', ccy:'USD', ttl:'Philly Fed Manufacturing', fcst:'8.0',  prev:'15.5', impact:3 },
  { time:'18:00', ccy:'USD', ttl:'Fed Bostic Speech',        fcst:'—',    prev:'—',    impact:2 },
  { time:'21:00', ccy:'EUR', ttl:'ECB Lagarde Speech',       fcst:'—',    prev:'—',    impact:2 },
];

const PENDING = [];

// ─────────────────────────────────────────────
// CONTRACT SPECS — used everywhere for margin and P/L
// ─────────────────────────────────────────────
// Per-symbol lot size in BASE units (or shares/coins/units).
// Standard contracts:
//   FX major pair: 100,000 base currency
//   XAU (gold):    100 troy ounces
//   XAG (silver):  5,000 troy ounces
//   Stocks/Crypto/Indices: 1 unit (we treat "lot" as "unit count")
function getLotSize(s) {
  if (s.sym === 'XAUUSD') return 100;
  if (s.sym === 'XAGUSD') return 5000;
  if (s.cls === 'FX')     return 100000;
  return 1;
}

// Returns true if the symbol is a USD-base FX pair (USDxxx) where the price
// is in the quote currency. For these, the notional is already expressed in
// USD (1 lot = 100,000 USD), and P/L is in quote currency requiring conversion.
function isUsdBaseFx(s) {
  return s.cls === 'FX' && /^USD/.test(s.sym) && !/^USD$/.test(s.sym);
}

// USD-equivalent notional value of a position.
function getNotionalUSD(s, vol, price) {
  const ls = getLotSize(s);
  if (isUsdBaseFx(s)) return vol * ls; // notional already in USD (lot × USD)
  return vol * ls * price;
}

// Required margin (USD) for a position at given price + leverage.
function getMarginUSD(s, vol, price, leverage) {
  return getNotionalUSD(s, vol, price) / leverage;
}

// USD-equivalent P/L for a position.
function getPnlUSD(s, openPx, closePx, side, vol) {
  const dist = (closePx - openPx) * (side === 'BUY' ? 1 : -1);
  const ls = getLotSize(s);
  if (isUsdBaseFx(s)) {
    // PnL in quote (e.g. JPY); divide by current rate to get USD
    return (dist * ls * vol) / closePx;
  }
  return dist * ls * vol;
}

window.getLotSize = getLotSize;
window.isUsdBaseFx = isUsdBaseFx;
window.getNotionalUSD = getNotionalUSD;
window.getMarginUSD = getMarginUSD;
window.getPnlUSD = getPnlUSD;

// Unit label per asset class. Stocks use "shares" instead of "lots" for readability.
function getUnitLabel(cls, plural = true) {
  if (cls === 'STOCK') return plural ? 'shares' : 'share';
  if (cls === 'CRYPTO') return 'units';
  if (cls === 'INDEX') return plural ? 'contracts' : 'contract';
  return 'lots';
}
function fmtVol(cls, vol) {
  if (cls === 'STOCK' || cls === 'INDEX') return Math.round(vol).toString();
  return vol.toFixed(2);
}
window.getUnitLabel = getUnitLabel;
window.fmtVol = fmtVol;

window.ALPEXA_MARKET = { SYMBOLS, createMarket, fmt, POSITIONS, HISTORY, NEWS, CALENDAR, PENDING, getLotSize, isUsdBaseFx, getNotionalUSD, getMarginUSD, getPnlUSD, getUnitLabel, fmtVol };
