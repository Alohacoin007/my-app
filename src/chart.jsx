// ALPEXA — Candlestick chart on Canvas
// Compact, performant, with optional MA20 overlay and volume strip.

const { useEffect, useRef, useState, useMemo } = React;

// Timeframe configurations — controls candle count, volatility scale, and labels
const TF_CONFIG = {
  M1:  { n: 60,  scale: 0.0008, label: 'min',  step: 1 },
  M5:  { n: 60,  scale: 0.0015, label: 'min',  step: 5 },
  M15: { n: 60,  scale: 0.0025, label: 'min',  step: 15 },
  H1:  { n: 80,  scale: 0.0050, label: 'h',    step: 1 },
  H4:  { n: 80,  scale: 0.0095, label: 'h',    step: 4 },
  D1:  { n: 90,  scale: 0.0180, label: 'd',    step: 1 },
  W1:  { n: 52,  scale: 0.0400, label: 'w',    step: 1 },
};

// Simple deterministic hash for seeded RNG
function seededRandom(seed) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

// Generate stable series for a given symbol + timeframe.
// Seeded by symbol + tf so the same series renders consistently across re-renders.
function genTfSeries(sym, tf, currentPrice) {
  const cfg = TF_CONFIG[tf] || TF_CONFIG.M15;
  const seedStr = sym + ':' + tf;
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) % 1000000;
  const rng = seededRandom(seed);
  // Walk backward from current price to a plausible starting point
  let p = currentPrice * (1 - cfg.scale * (1 + rng() * 0.4));
  const arr = [];
  for (let i = 0; i < cfg.n; i++) {
    const o = p;
    const dir = rng() > 0.48 ? 1 : -1;
    const range = currentPrice * (cfg.scale * 0.18 + rng() * cfg.scale * 0.5);
    const c = o + dir * range * (0.3 + rng() * 0.9);
    const h = Math.max(o, c) + range * rng() * 0.6;
    const l = Math.min(o, c) - range * rng() * 0.6;
    const v = 0.3 + rng() * 0.7;
    arr.push({ o, h, l, c, v });
    p = c;
  }
  // Last candle's close = current live price so chart connects to reality
  if (arr.length) {
    const last = arr[arr.length - 1];
    last.c = currentPrice;
    last.h = Math.max(last.h, currentPrice);
    last.l = Math.min(last.l, currentPrice);
  }
  return arr;
}

function Chart({ series, sym, tf, digits = 5, showMA = true, showVol = true, accent = '#22B8CF', height = 280, candleCount }) {
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [w, setW] = useState(360);

  // If sym + tf provided, generate fresh series for that tf; else fall back to passed-in series
  const liveSeries = useMemo(() => {
    if (sym && tf && series && series.length) {
      const last = series[series.length - 1].c;
      const full = genTfSeries(sym, tf, last);
      // If candleCount override provided (e.g. when zoomed), trim to most-recent N candles
      if (candleCount && full.length > candleCount) {
        return full.slice(full.length - candleCount);
      }
      return full;
    }
    return series;
  }, [sym, tf, candleCount, series && series[series.length - 1] && series[series.length - 1].c]);

  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setW(e.contentRect.width);
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!ref.current || !liveSeries.length) return;
    draw();
  }, [liveSeries, w, height, showMA, showVol, hover, accent, tf]);

  function draw() {
    const cnv = ref.current;
    const dpr = window.devicePixelRatio || 1;
    const W = w, H = height;
    cnv.width = W * dpr; cnv.height = H * dpr;
    cnv.style.width = W + 'px'; cnv.style.height = H + 'px';
    const ctx = cnv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const padR = 56, padL = 6, padT = 8;
    const volH = showVol ? 36 : 0;
    const padB = volH + 22; // bottom axis + vol
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    // price extents
    const hi = Math.max(...liveSeries.map(c => c.h));
    const lo = Math.min(...liveSeries.map(c => c.l));
    const pad = (hi - lo) * 0.08;
    const yMax = hi + pad, yMin = lo - pad;
    const y2p = v => padT + (1 - (v - yMin) / (yMax - yMin)) * plotH;
    const cw = plotW / liveSeries.length;
    const x2idx = x => Math.max(0, Math.min(liveSeries.length - 1, Math.floor((x - padL) / cw)));

    // grid
    const isDark = document.documentElement.classList.contains('dark');
    ctx.strokeStyle = isDark ? '#2F384C' : '#ECEEF3';
    ctx.lineWidth = 1;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = isDark ? '#6A7385' : '#98A1B3';
    ctx.textAlign = 'left';
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i) / 4;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      const v = yMax - ((yMax - yMin) * i) / 4;
      ctx.fillText(v.toFixed(digits), padL + plotW + 4, y + 3);
    }

    // MA20
    if (showMA && liveSeries.length > 20) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 19; i < liveSeries.length; i++) {
        let sum = 0;
        for (let j = i - 19; j <= i; j++) sum += liveSeries[j].c;
        const ma = sum / 20;
        const x = padL + cw * (i + 0.5);
        const y = y2p(ma);
        if (i === 19) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // candles
    const bodyW = Math.max(3, cw * 0.75);
    liveSeries.forEach((c, i) => {
      const x = padL + cw * (i + 0.5);
      const up = c.c >= c.o;
      const col = up ? '#15A36C' : '#E5384F';
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      // wick
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y2p(c.h));
      ctx.lineTo(x, y2p(c.l));
      ctx.stroke();
      // body
      const bt = y2p(Math.max(c.o, c.c));
      const bb = y2p(Math.min(c.o, c.c));
      ctx.fillRect(x - bodyW/2, bt, bodyW, Math.max(1, bb - bt));
    });

    // last price line
    const last = liveSeries[liveSeries.length - 1].c;
    const yL = y2p(last);
    ctx.setLineDash([3,3]);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, yL); ctx.lineTo(padL + plotW, yL); ctx.stroke();
    ctx.setLineDash([]);
    // last price pill
    ctx.fillStyle = accent;
    const pillW = 54, pillH = 16;
    ctx.fillRect(padL + plotW + 2, yL - pillH/2, pillW, pillH);
    ctx.fillStyle = '#fff';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(last.toFixed(digits), padL + plotW + 2 + pillW/2, yL + 3);
    ctx.textAlign = 'left';

    // volume strip
    if (showVol) {
      const vMax = Math.max(...liveSeries.map(c => c.v));
      const vTop = H - padB + 8;
      const vH = volH - 10;
      liveSeries.forEach((c, i) => {
        const x = padL + cw * (i + 0.5);
        const up = c.c >= c.o;
        ctx.fillStyle = up ? 'rgba(21,163,108,0.4)' : 'rgba(229,56,79,0.4)';
        const h = (c.v / vMax) * vH;
        ctx.fillRect(x - bodyW/2, vTop + (vH - h), bodyW, h);
      });
    }

    // x axis labels (every ~10)
    ctx.fillStyle = '#98A1B3';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const labelStep = Math.ceil(liveSeries.length / 5);
    for (let i = 0; i < liveSeries.length; i += labelStep) {
      const x = padL + cw * (i + 0.5);
      const stepsAgo = liveSeries.length - i;
      const cfg = TF_CONFIG[tf] || { label:'min', step:1 };
      const total = stepsAgo * cfg.step;
      const lbl = stepsAgo === 0 ? 'now' : `${total}${cfg.label.charAt(0)}`;
      ctx.fillText(lbl, x, H - 6);
    }

    // crosshair
    if (hover !== null) {
      const i = Math.min(hover, liveSeries.length - 1);
      const x = padL + cw * (i + 0.5);
      const c = liveSeries[i];
      ctx.strokeStyle = 'rgba(10,14,26,0.4)';
      ctx.setLineDash([2,3]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
      ctx.setLineDash([]);
      // dot
      ctx.fillStyle = '#0A0E1A';
      ctx.beginPath(); ctx.arc(x, y2p(c.c), 3, 0, Math.PI*2); ctx.fill();
    }
  }

  function onMove(e) {
    const rect = ref.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const padL = 6, padR = 56;
    const cw = (w - padL - padR) / liveSeries.length;
    const idx = Math.max(0, Math.min(liveSeries.length - 1, Math.floor((x - padL) / cw)));
    setHover(idx);
  }

  const hoverCandle = hover !== null ? liveSeries[Math.min(hover, liveSeries.length - 1)] : null;

  return (
    <div ref={wrapRef} style={{ position:'relative', width:'100%' }}>
      <canvas
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchMove={onMove}
        onTouchEnd={() => setHover(null)}
      />
      {hoverCandle && (
        <div style={{
          position:'absolute', top:6, left:8, padding:'5px 8px',
          background:'rgba(10,14,26,0.92)', color:'#fff', borderRadius:6,
          fontFamily:'JetBrains Mono, monospace', fontSize:10, lineHeight:1.5,
          pointerEvents:'none', whiteSpace:'nowrap',
        }}>
          <span style={{color:'#98A1B3'}}>O </span>{hoverCandle.o.toFixed(digits)}
          {'  '}<span style={{color:'#98A1B3'}}>H </span>{hoverCandle.h.toFixed(digits)}
          {'  '}<span style={{color:'#98A1B3'}}>L </span>{hoverCandle.l.toFixed(digits)}
          {'  '}<span style={{color:'#98A1B3'}}>C </span>{hoverCandle.c.toFixed(digits)}
        </div>
      )}
    </div>
  );
}

window.Chart = Chart;
