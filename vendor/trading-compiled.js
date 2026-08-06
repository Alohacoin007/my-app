// ⚠️ 생성 파일 — 직접 수정 금지. 원본: src/trading-app.jsx → node tools/precompile-jsx.js (ALPEXA Trading (모바일 FX))
// ALPEXA Trading (모바일 FX 앱) — 원본 JSX. trading.html의 인브라우저 Babel 블록에서 추출 (2026-07-31 P1).
// 수정 후 반드시: node tools/precompile-jsx.js  (vendor/trading-compiled.js 재생성 — 신선도는 verify가 강제)
const {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback
} = React;

// ── Prefs / Currency / Leverage helpers ──
const DEFAULT_PREFS = {
  oneClick: true,
  biometric: true,
  currency: 'USD'
};
const CURRENCIES = [{
  code: 'USD',
  symbol: '$',
  name: 'US Dollar',
  rate: 1
}, {
  code: 'EUR',
  symbol: '€',
  name: 'Euro',
  rate: 0.92
}, {
  code: 'GBP',
  symbol: '£',
  name: 'British Pound',
  rate: 0.79
}, {
  code: 'JPY',
  symbol: '¥',
  name: 'Japanese Yen',
  rate: 156
}, {
  code: 'KRW',
  symbol: '₩',
  name: 'South Korean Won',
  rate: 1370
}, {
  code: 'CNY',
  symbol: '¥',
  name: 'Chinese Yuan',
  rate: 7.25
}, {
  code: 'CHF',
  symbol: 'Fr',
  name: 'Swiss Franc',
  rate: 0.91
}, {
  code: 'AUD',
  symbol: 'A$',
  name: 'Australian Dollar',
  rate: 1.52
}, {
  code: 'CAD',
  symbol: 'C$',
  name: 'Canadian Dollar',
  rate: 1.36
}, {
  code: 'SGD',
  symbol: 'S$',
  name: 'Singapore Dollar',
  rate: 1.34
}, {
  code: 'HKD',
  symbol: 'HK$',
  name: 'Hong Kong Dollar',
  rate: 7.82
}, {
  code: 'USDT',
  symbol: '₮',
  name: 'Tether (Stablecoin)',
  rate: 1
}];
function getCurrency(code) {
  return CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
}
window.CURRENCIES = CURRENCIES;
window.getCurrency = getCurrency;
function getPrefs() {
  try {
    const raw = localStorage.getItem('alpexa.prefs');
    if (raw) return {
      ...DEFAULT_PREFS,
      ...JSON.parse(raw)
    };
  } catch (e) {}
  return {
    ...DEFAULT_PREFS
  };
}
function setPref(key, value) {
  const cur = getPrefs();
  cur[key] = value;
  try {
    localStorage.setItem('alpexa.prefs', JSON.stringify(cur));
  } catch (e) {}
  window.dispatchEvent(new CustomEvent('alpexa-prefs-change', {
    detail: {
      key,
      value
    }
  }));
}
window.getPrefs = getPrefs;
window.setPref = setPref;
// ── Funding (deposit/withdraw/transfer) history ──
// Real service: no fake demo funding history. Real records come from actual
// deposits / withdrawals / transfers.
const FUNDING_SEED = [];
function getFundingHistory() {
  try {
    const raw = localStorage.getItem('alpexa.funding');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        // One-time cleanup: strip the old hard-coded demo seed records if any got baked in.
        return arr.filter(function (r) {
          return !(r && r.id && String(r.id).indexOf('F-08471293-') === 0);
        });
      }
    }
  } catch (e) {}
  return [...FUNDING_SEED];
}
function pushFundingHistory(rec) {
  const user = function () {
    try {
      const raw = localStorage.getItem('alpexa_current_user');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }();
  const cid = user && user.clientId || 'c026';
  // Map account context to server tag: 'live'→FX, 'crypto'→CRYPTO, 'sports'→SPORTS
  const SRV_MAP = {
    live: 'FX',
    crypto: 'CRYPTO',
    sports: 'SPORTS'
  };
  const srv = SRV_MAP[rec.account] || SRV_MAP[rec.destAcct] || rec.server || 'FX';
  const arr = getFundingHistory();
  const next = [{
    id: 'F-' + Date.now().toString(36).toUpperCase(),
    ts: Date.now(),
    status: 'pending',
    clientId: cid,
    server: srv,
    ...rec
  }, ...arr].slice(0, 200);
  try {
    localStorage.setItem('alpexa.funding', JSON.stringify(next));
  } catch (e) {}
  window.dispatchEvent(new Event('alpexa-funding-change'));
}
window.getFundingHistory = getFundingHistory;
window.pushFundingHistory = pushFundingHistory;
// ── Account balances (live → updated by deposit/withdraw/transfer) ──
// === Manager Sync — DISABLED (#5) ===
// The manager dashboard reads open positions straight from the SERVER `positions`
// table (created by fx_open, closed by fx_close — see manager-mobile.html), so it
// sees EVERY customer's positions via admin RLS. The old localStorage `alpexa.positions`
// mirror only worked inside one browser and put money/position state in localStorage,
// so it's removed. These hooks stay as no-ops so call sites don't throw.
window.broadcastPositionOpen = function () {};
window.broadcastPositionClose = function () {};

// ── Pending orders v2 (2026-07-22 "고고"): 접수·취소는 서버 RPC만 — 직접 테이블 쓰기 폐쇄.
// fx_place_pending = 방향 검증 + 멱등 접수 · fx_cancel_pending = pending 상태만 원자 취소
// (filled/rejected 감사 행은 절대 안 지움 — 옛 delete는 status 무관이라 감사 유실 위험이 있었다).
// 판정·체결은 서버 fx_pending_fill(워터마크+원자 선점+단일 코어)이 유일 경로 — 클라 감시 없음.
function fxMe() {
  try {
    return JSON.parse(localStorage.getItem('alpexa.me') || 'null');
  } catch (e) {
    return null;
  }
}
function fxPendingPlace(p, onReject) {
  try {
    if (!(window.AlpexaSync && AlpexaSync.db)) return;
    const me = fxMe();
    if (!me || !me.accts || !me.accts.fx) return;
    AlpexaSync.db.rpc('fx_place_pending', {
      p_local_id: String(p.id),
      p_symbol: p.sym || '',
      p_side: p.side || '',
      p_otype: p.otype || '',
      p_size: +p.vol || 0,
      p_trigger: p.trigger != null ? +p.trigger : null,
      p_sl: p.sl != null && +p.sl > 0 ? +p.sl : null,
      p_tp: p.tp != null && +p.tp > 0 ? +p.tp : null
    }).then(function (r) {
      const d = r && r.data;
      if (d && d.ok === false && onReject) onReject(String(d.error || 'rejected'));
    }, function () {});
  } catch (e) {}
}
function fxPendingCancel(id) {
  try {
    if (!(window.AlpexaSync && AlpexaSync.db)) return;
    const me = fxMe();
    if (!me || !me.accts || !me.accts.fx) return;
    AlpexaSync.db.rpc('fx_cancel_pending', {
      p_local_id: String(id)
    }).then(function () {}, function () {});
  } catch (e) {}
}
// SL/TP는 서버 주문 (2026-07-22 "고고"): fx_modify가 positions.meta에 저장 → 서버 fx_sltp가
// 24시간 초단위+워터마크로 집행. 폰 메모리 SL/TP(새로고침에 증발·앱 닫으면 미집행)는 폐지.
function fxModifyReal(id, sl, tp, onReject) {
  try {
    if (!(window.AlpexaSync && AlpexaSync.db)) return;
    const me = fxMe();
    if (!me || !me.accts || !me.accts.fx) return;
    AlpexaSync.db.rpc('fx_modify', {
      p_local_id: String(id),
      p_sl: sl != null && +sl > 0 ? +sl : null,
      p_tp: tp != null && +tp > 0 ? +tp : null
    }).then(function (r) {
      const d = r && r.data;
      if (d && d.ok === false && onReject) onReject(String(d.error || 'rejected'));
    }, function () {});
  } catch (e) {}
}

// No fake seed — the real balance is loaded from the server (accounts.balance).
// Held IN MEMORY only (window.__fxBal); never persisted to localStorage.
const DEFAULT_BALANCES = {
  live: 0,
  crypto: 0,
  sports: 0
};
function getBalances() {
  return {
    ...DEFAULT_BALANCES,
    ...(window.__fxBal || {})
  };
}
function setBalances(obj) {
  window.__fxLocalTs = Date.now();
  window.__fxBal = obj;
  window.dispatchEvent(new Event('alpexa-balance-change'));
}
// Withdrawable/transferable cap for FX: free margin (excludes floating losses),
// capped at realized cash. Server (withdrawable_for) is the real gate; this is UX
// so a user can't Max out floating-loss money that isn't really there (#24).
function fxAvail() {
  var live = window.__fxBal && +window.__fxBal.live || 0;
  var f = parseFloat(localStorage.getItem('alpexa.fxFree'));
  return Math.max(0, isFinite(f) ? Math.min(live, f) : live);
}
function addBalance(acctId, delta) {
  const b = getBalances();
  b[acctId] = Math.max(0, (b[acctId] || 0) + delta);
  setBalances(b);
}
function fmtBalance(n) {
  return '$' + (n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
window.getBalances = getBalances;
window.addBalance = addBalance;
window.fmtBalance = fmtBalance;
// Shared cross-app server balances (so every app's server switcher agrees).
// Cross-app dropdown balances — in memory only, populated from the server via
// pullBalances (returns fx/sports/crypto). No fake seed, no localStorage.
function getServerBalances() {
  return Object.assign({
    crypto: 0,
    fx: 0,
    sports: 0
  }, window.__fxSrvBal || {});
}
function srvBalById(id) {
  const s = getServerBalances();
  return id === 'live' ? s.fx : id === 'crypto' ? s.crypto : s.sports;
}
function syncMyServerBalance() {
  try {
    const o = getServerBalances();
    o.fx = getBalances().live;
    window.__fxSrvBal = o;
  } catch (e) {}
}
window.addEventListener('alpexa-balance-change', syncMyServerBalance);
syncMyServerBalance();
const DEFAULT_LEVERAGE = {
  FX: 500,
  INDEX: 20,
  STOCK: 5,
  CRYPTO: 5
}; // FX 500:1 (2026-07-19 사장님 승인, 서버 fx_lev_cap 락스텝)
function getLeverageSettings() {
  try {
    const raw = localStorage.getItem('alpexa.leverage');
    if (raw) return {
      ...DEFAULT_LEVERAGE,
      ...JSON.parse(raw)
    };
  } catch (e) {}
  return {
    ...DEFAULT_LEVERAGE
  };
}
function setLeverageSettings(settings) {
  try {
    localStorage.setItem('alpexa.leverage', JSON.stringify(settings));
  } catch (e) {}
  window.dispatchEvent(new Event('alpexa-leverage-change'));
}
window.getLeverageSettings = getLeverageSettings;
window.setLeverageSettings = setLeverageSettings;

// ── iOS Frame Components ──
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system,"SF Pro",system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false
}) {
  const [time, setTime] = useState(() => {
    const n = new Date();
    return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
  });
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setTime(String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'));
    }, 10000);
    return () => clearInterval(id);
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    className: "ios-device",
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18),0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system,system-ui,sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark,
    time: time
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children)), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ── TweaksPanel (simplified) ──
const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;background:rgba(250,249,247,.78);color:#29261b;-webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);border:.5px solid rgba(255,255,255,.6);border-radius:14px;box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;overflow-x:hidden;min-height:0;scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}
  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2}
  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);transition:transform .12s}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),0 2px 6px rgba(0,0,0,.15)}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}
`;
function useTweaks(defaults) {
  const [values, setValues] = useState(defaults);
  const setTweak = useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null ? keyOrEdits : {
      [keyOrEdits]: val
    };
    setValues(prev => ({
      ...prev,
      ...edits
    }));
    try {
      window.parent.postMessage({
        type: '__edit_mode_set_keys',
        edits
      }, '*');
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('tweakchange', {
      detail: edits
    }));
  }, []);
  return [values, setTweak];
}
function TweaksPanel({
  title = 'Tweaks',
  children
}) {
  const [open, setOpen] = useState(false);
  const dragRef = useRef(null);
  const offsetRef = useRef({
    x: 16,
    y: 16
  });
  const PAD = 16;
  const clampToViewport = useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth,
      h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y))
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);
  useEffect(() => {
    if (!open) return;
    clampToViewport();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(clampToViewport) : null;
    if (ro && document.documentElement) ro.observe(document.documentElement);else window.addEventListener('resize', clampToViewport);
    return () => {
      if (ro) ro.disconnect();else window.removeEventListener('resize', clampToViewport);
    };
  }, [open, clampToViewport]);
  useEffect(() => {
    const onMsg = e => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    try {
      window.parent.postMessage({
        type: '__edit_mode_available'
      }, '*');
    } catch (e) {}
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const onDragStart = e => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX,
      sy = e.clientY;
    const startRight = window.innerWidth - r.right,
      startBottom = window.innerHeight - r.bottom;
    const move = ev => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy)
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  if (!open) return null;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, __TWEAKS_STYLE), /*#__PURE__*/React.createElement("div", {
    ref: dragRef,
    className: "twk-panel",
    style: {
      right: offsetRef.current.x,
      bottom: offsetRef.current.y
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-hd",
    onMouseDown: onDragStart
  }, /*#__PURE__*/React.createElement("b", null, title), /*#__PURE__*/React.createElement("button", {
    className: "twk-x",
    onMouseDown: e => e.stopPropagation(),
    onClick: () => {
      setOpen(false);
      try {
        window.parent.postMessage({
          type: '__edit_mode_dismissed'
        }, '*');
      } catch (e) {}
    }
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "twk-body"
  }, children)));
}
function TweakSection({
  label,
  children
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "twk-sect"
  }, label), children);
}
function TweakRadio({
  label,
  value,
  options,
  onChange
}) {
  const opts = options.map(o => typeof o === 'object' ? o : {
    value: o,
    label: o
  });
  const idx = Math.max(0, opts.findIndex(o => o.value === value));
  const n = opts.length;
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("div", {
    className: "twk-seg"
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-seg-thumb",
    style: {
      left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
      width: `calc((100% - 4px) / ${n})`
    }
  }), opts.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    type: "button",
    onClick: () => onChange(o.value)
  }, o.label))));
}
function TweakColor({
  label,
  value,
  options,
  onChange
}) {
  if (!options || !options.length) {
    return /*#__PURE__*/React.createElement("div", {
      className: "twk-row twk-row-h"
    }, /*#__PURE__*/React.createElement("div", {
      className: "twk-lbl"
    }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("input", {
      type: "color",
      value: value,
      onChange: e => onChange(e.target.value),
      style: {
        width: 56,
        height: 22,
        border: '.5px solid rgba(0,0,0,.1)',
        borderRadius: 6,
        padding: 0,
        cursor: 'pointer',
        background: 'transparent',
        flexShrink: 0
      }
    }));
  }
  const key = o => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("div", {
    className: "twk-chips"
  }, options.map((o, i) => {
    const colors = Array.isArray(o) ? o : [o];
    const [hero, ...rest] = colors;
    const on = key(o) === cur;
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      className: "twk-chip",
      "data-on": on ? '1' : '0',
      style: {
        background: hero
      },
      onClick: () => onChange(o)
    }, on && /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 14 14",
      "aria-hidden": "true"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M3 7.2 5.8 10 11 4.2",
      fill: "none",
      strokeWidth: "2.2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      stroke: parseInt(hero.replace('#', ''), 16) > 8355711 ? 'rgba(0,0,0,.78)' : '#fff'
    })));
  })));
}

// ── Icons ──
const Mi = ({
  name,
  size,
  weight,
  fill,
  style
}) => /*#__PURE__*/React.createElement("span", {
  className: "msi" + (fill ? " fill" : ""),
  style: {
    fontSize: size || 18,
    fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight || 400}, 'GRAD' 0, 'opsz' 24`,
    ...style
  }
}, name);
const ScreenIcons = {
  search: /*#__PURE__*/React.createElement(Mi, {
    name: "search",
    size: 16
  }),
  plus: /*#__PURE__*/React.createElement(Mi, {
    name: "add",
    size: 18,
    weight: 500
  }),
  bell: /*#__PURE__*/React.createElement(Mi, {
    name: "notifications",
    size: 20
  }),
  menu: /*#__PURE__*/React.createElement(Mi, {
    name: "more_vert",
    size: 20
  }),
  chev: /*#__PURE__*/React.createElement(Mi, {
    name: "chevron_right",
    size: 16
  }),
  star: filled => /*#__PURE__*/React.createElement(Mi, {
    name: "star",
    size: 14,
    fill: filled
  }),
  filter: /*#__PURE__*/React.createElement(Mi, {
    name: "filter_list",
    size: 16
  }),
  sort: /*#__PURE__*/React.createElement(Mi, {
    name: "swap_vert",
    size: 16
  }),
  refresh: /*#__PURE__*/React.createElement(Mi, {
    name: "refresh",
    size: 16
  }),
  globe: /*#__PURE__*/React.createElement(Mi, {
    name: "public",
    size: 16
  }),
  card: /*#__PURE__*/React.createElement(Mi, {
    name: "credit_card",
    size: 16
  })
};

// ── Chart component ──
// Caps = the readability limit of this FIXED-WINDOW canvas chart (no pan — deep multi-year
// scroll lives in webtrade). Raised 2026-07-13: M/H 120 · D1 180 (~9mo) · W1 104 (~2y).
const TF_CONFIG = {
  M1: {
    n: 120,
    scale: 0.0008,
    label: 'min',
    step: 1
  },
  M5: {
    n: 120,
    scale: 0.0015,
    label: 'min',
    step: 5
  },
  M15: {
    n: 120,
    scale: 0.0025,
    label: 'min',
    step: 15
  },
  H1: {
    n: 120,
    scale: 0.0050,
    label: 'h',
    step: 1
  },
  H4: {
    n: 120,
    scale: 0.0095,
    label: 'h',
    step: 4
  },
  D1: {
    n: 180,
    scale: 0.0180,
    label: 'd',
    step: 1
  },
  W1: {
    n: 104,
    scale: 0.0400,
    label: 'w',
    step: 1
  }
};
function seededRandom(seed) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}
function genTfSeries(sym, tf, currentPrice) {
  const cfg = TF_CONFIG[tf] || TF_CONFIG.M15;
  const seedStr = sym + ':' + tf;
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) % 1000000;
  const rng = seededRandom(seed);
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
    arr.push({
      o,
      h,
      l,
      c,
      v
    });
    p = c;
  }
  if (arr.length) {
    const last = arr[arr.length - 1];
    last.c = currentPrice;
    last.h = Math.max(last.h, currentPrice);
    last.l = Math.min(last.l, currentPrice);
  }
  return arr;
}
// ── Time-based candle engine (broker-style) ──────────────────────────────────
// Real wall-clock buckets per timeframe; PAST candles are frozen, only the
// current one tracks the live price; persisted so reload keeps history. This is
// the stepping stone to server-stored candles (swap the source later).
function tfMs(tf) {
  const c = TF_CONFIG[tf] || TF_CONFIG.M15;
  const step = c.step || 1;
  const unit = c.label === 'min' ? 60000 : c.label === 'h' ? 3600000 : c.label === 'd' ? 86400000 : c.label === 'w' ? 604800000 : 60000;
  return step * unit;
}
function fxCandles(sym, tf, livePrice) {
  const cfg = TF_CONFIG[tf] || TF_CONFIG.M15,
    ms = tfMs(tf),
    cap = cfg.n || 80,
    key = 'alpexa.fxc.' + sym + '.' + tf;
  if (!(livePrice > 0)) return genTfSeries(sym, tf, livePrice || 1);
  let store = null;
  try {
    store = JSON.parse(localStorage.getItem(key) || 'null');
  } catch (e) {}
  const nowB = Math.floor(Date.now() / ms);
  let arr;
  if (!store || !store.c || !store.c.length || nowB - store.c[store.c.length - 1].b > cap) {
    if (window.FRESH_LISTINGS && window.FRESH_LISTINGS[sym]) {
      // Brand-new listing (e.g. SpaceX IPO'd today): no fabricated past — start at the live price.
      arr = [{
        o: livePrice,
        h: livePrice,
        l: livePrice,
        c: livePrice,
        v: 0.5,
        b: nowB
      }];
    } else {
      // First load (or huge gap): seed a deterministic history ending at "now".
      const seeded = genTfSeries(sym, tf, livePrice);
      arr = seeded.map((k, i) => ({
        o: k.o,
        h: k.h,
        l: k.l,
        c: k.c,
        v: k.v,
        b: nowB - (seeded.length - 1 - i)
      }));
    }
  } else {
    arr = store.c;
    const last = arr[arr.length - 1];
    if (nowB > last.b) {
      // Open new candle(s) for each elapsed bucket; open = previous close.
      let prev = last.c;
      for (let bb = last.b + 1; bb <= nowB; bb++) {
        arr.push({
          o: prev,
          h: Math.max(prev, livePrice),
          l: Math.min(prev, livePrice),
          c: livePrice,
          v: 0.3 + Math.random() * 0.5,
          b: bb
        });
        prev = livePrice;
      }
    }
  }
  // Update the CURRENT (last) candle with the live price.
  const cur = arr[arr.length - 1];
  cur.c = livePrice;
  if (livePrice > cur.h) cur.h = livePrice;
  if (livePrice < cur.l) cur.l = livePrice;
  if (arr.length > cap) arr = arr.slice(arr.length - cap);
  try {
    localStorage.setItem(key, JSON.stringify({
      c: arr
    }));
  } catch (e) {}
  return arr.map(k => ({
    o: k.o,
    h: k.h,
    l: k.l,
    c: k.c,
    v: k.v
  }));
}
// Real chart history from our server (Polygon → fx-prices Edge Function). FX only;
// key stays server-side. We seed the time-based candle store with REAL bars, then
// the engine builds the current candle forward from the (also real) live feed.
const FX_FN_URL = 'https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/fx-prices';
// Brand-new listings have no real past — the chart starts at the live price
// instead of fabricating history. SpaceX (SPCX) IPO'd 2026-06-12.
window.FRESH_LISTINGS = window.FRESH_LISTINGS || {
  SPACEX: 1
};
// Clear any pre-IPO simulated candle history for fresh listings (rebuild from real/live).
try {
  Object.keys(window.FRESH_LISTINGS).forEach(function (s) {
    ['M1', 'M5', 'M15', 'H1', 'H4', 'D1', 'W1'].forEach(function (tf) {
      localStorage.removeItem('alpexa.fxc.' + s + '.' + tf);
    });
  });
} catch (e) {}
// App symbol → Twelve Data symbol when they differ (SpaceX trades as SPCX).
const TD_SYM_OVERRIDE = {
  SPACEX: 'SPCX'
};
function fetchRealCandles(sym, tf) {
  try {
    const o = (window.ALPEXA_MARKET && ALPEXA_MARKET.SYMBOLS || []).find(x => x.sym === sym);
    if (!o || typeof fetch !== 'function') return;
    const ckey = sym + '|' + tf;
    window.__alpexaFXCReq = window.__alpexaFXCReq || {};
    if (window.__alpexaFXCReq[ckey]) return;
    window.__alpexaFXCReq[ckey] = 1;
    const ms = tfMs(tf),
      cap = (TF_CONFIG[tf] || TF_CONFIG.M15).n || 80;
    const seed = bars => {
      let arr = bars.map(k => ({
        o: +k.o,
        h: +k.h,
        l: +k.l,
        c: +k.c,
        v: +k.v || 0.5,
        b: Math.floor(+k.t / ms)
      })).filter(k => isFinite(k.c) && k.c > 0);
      if (!arr.length) {
        window.__alpexaFXCReq[ckey] = 0;
        return;
      }
      if (arr.length > cap) arr = arr.slice(arr.length - cap);
      try {
        localStorage.setItem('alpexa.fxc.' + sym + '.' + tf, JSON.stringify({
          c: arr,
          real: 1
        }));
      } catch (e) {}
    };
    if (o.cls === 'FX') {
      // FX/metals: real candles from our server (Polygon).
      fetch(FX_FN_URL + '?candles=' + encodeURIComponent(sym) + '&tf=' + encodeURIComponent(tf) + '&n=' + Math.max(200, cap)).then(r => r.json()).then(j => {
        if (!j || !j.ok || !Array.isArray(j.candles) || !j.candles.length) {
          window.__alpexaFXCReq[ckey] = 0;
          return;
        }
        seed(j.candles);
      }).catch(() => {
        window.__alpexaFXCReq[ckey] = 0;
      });
    } else if (o.cls === 'STOCK' || o.cls === 'INDEX') {
      // stocks/indices: Twelve Data time_series (free).
      const iv = TD_INTERVAL[tf] || '15min';
      const tdsym = TD_SYM_OVERRIDE[sym] || tdSymbolFor(sym);
      fetch('https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(tdsym) + '&interval=' + iv + '&outputsize=120&order=ASC&apikey=' + TD_KEY_CHART).then(r => r.json()).then(j => {
        if (j && Array.isArray(j.values) && j.values.length) {
          seed(j.values.map(v => ({
            t: Date.parse(v.datetime),
            o: v.open,
            h: v.high,
            l: v.low,
            c: v.close,
            v: +(v.volume || 0)
          })));
        } else {
          window.__alpexaFXCReq[ckey] = 0;
        } // no data → engine handles (fresh listings stay flat)
      }).catch(() => {
        window.__alpexaFXCReq[ckey] = 0;
      });
    } else {
      window.__alpexaFXCReq[ckey] = 0;
    }
  } catch (e) {}
}
// Twelve Data helpers for real chart history
const TD_KEY_CHART = '6fef3bc69c2842a2b4a127969f766eb0';
const TD_INTERVAL = {
  M1: '1min',
  M5: '5min',
  M15: '15min',
  H1: '1h',
  H4: '4h',
  D1: '1day',
  W1: '1week'
};
const TD_INDEX_MAP = {
  NAS100: 'NDX',
  SPX500: 'SPX',
  US30: 'DJI',
  GER40: 'DAX',
  UK100: 'FTSE',
  JPN225: 'N225',
  HK50: 'HSI',
  AUS200: 'AXJO',
  EUSTX50: 'STOXX50E',
  WTI: 'WTI/USD'
};
function tdSymbolFor(symStr) {
  if (TD_INDEX_MAP[symStr]) return TD_INDEX_MAP[symStr];
  var o = (window.ALPEXA_MARKET && ALPEXA_MARKET.SYMBOLS || []).find(x => x.sym === symStr);
  if (o && o.cls === 'STOCK') return symStr;
  return symStr.length === 6 ? symStr.slice(0, 3) + '/' + symStr.slice(3) : symStr;
}
function Chart({
  series,
  sym,
  tf,
  digits = 5,
  showMA = true,
  showVol = true,
  showBB = false,
  showRSI = false,
  showMACD = false,
  accent = '#22B8CF',
  height = 280,
  candleCount,
  fillContainer = false
}) {
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [w, setW] = useState(360);
  const [h, setH] = useState(height);
  // Real historical candles from Twelve Data (only for the main chart, cached per sym|tf).
  const [realMap, setRealMap] = useState({});
  const realKey = sym + '|' + tf;
  useEffect(() => {
    // Seed the FX candle store with REAL Polygon history (via our server). The
    // time-based engine below then builds the live candle forward from the real
    // feed — past + live are both real now, so they line up (no more spikes).
    if (!fillContainer || !sym || !tf) return;
    fetchRealCandles(sym, tf);
  }, [sym, tf, fillContainer]);
  const liveSeries = useMemo(() => {
    // LIVE CANDLE = the REAL feed mid (2026-07-13, display lockstep — the chart limb): the sim
    // engine price jitters beyond the real market and made the current candle "dance" while
    // quotes/P&L already read the real feed. Sim last stays as the no-feed fallback (stocks/indices).
    const f = (typeof window !== 'undefined' && window.__alpexaFXFeed || {})[sym];
    const livePx = f && +f.mid > 0 ? +f.mid : series && series.length ? series[series.length - 1].c : null;
    // Main chart: time-based persistent candles (broker-style). Past candles
    // frozen, current one tracks the live price, survives reloads.
    if (fillContainer && sym && tf && livePx != null && isFinite(livePx)) {
      const full = fxCandles(sym, tf, livePx);
      if (candleCount && full.length > candleCount) return full.slice(full.length - candleCount);
      return full;
    }
    if (sym && tf && series && series.length) {
      const last = series[series.length - 1].c;
      const full = genTfSeries(sym, tf, last);
      if (candleCount && full.length > candleCount) return full.slice(full.length - candleCount);
      return full;
    }
    return series;
  }, [sym, tf, candleCount, fillContainer, series && series[series.length - 1] && series[series.length - 1].c]);
  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setW(e.contentRect.width);
        if (fillContainer && e.contentRect.height > 0) setH(e.contentRect.height);
      }
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [fillContainer]);
  useEffect(() => {
    if (!fillContainer) setH(height);
  }, [height, fillContainer]);
  useEffect(() => {
    if (!ref.current || !liveSeries || !liveSeries.length) return;
    draw();
  }, [liveSeries, w, h, showMA, showVol, showBB, showRSI, showMACD, hover, accent, tf]);
  function draw() {
    const cnv = ref.current;
    const dpr = window.devicePixelRatio || 1;
    const W = w,
      H = h;
    cnv.width = W * dpr;
    cnv.height = H * dpr;
    cnv.style.width = W + 'px';
    cnv.style.height = H + 'px';
    const ctx = cnv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const padR = 56,
      padL = 6,
      padT = 8;
    const volH = showVol ? 36 : 0;
    const rsiH = showRSI ? 52 : 0;
    const macdH = showMACD ? 54 : 0;
    const subGap = (showVol ? 4 : 0) + (showRSI ? 4 : 0) + (showMACD ? 4 : 0);
    const padB = volH + rsiH + macdH + subGap + 22;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const hi = Math.max(...liveSeries.map(c => c.h));
    const lo = Math.min(...liveSeries.map(c => c.l));
    const pad = (hi - lo) * 0.08;
    const yMax = hi + pad,
      yMin = lo - pad;
    const y2p = v => padT + (1 - (v - yMin) / (yMax - yMin)) * plotH;
    const cw = plotW / liveSeries.length;
    const isDark = document.documentElement.classList.contains('dark');
    // MT5-style grid: more visible lines
    ctx.strokeStyle = isDark ? '#3A4358' : '#D7DCE3';
    ctx.lineWidth = 1;
    ctx.font = '10px "JetBrains Mono",monospace';
    ctx.fillStyle = isDark ? '#8896AC' : '#5F6A7D';
    ctx.textAlign = 'left';
    for (let i = 0; i <= 4; i++) {
      const y = padT + plotH * i / 4;
      // Dotted grid like MT5
      ctx.setLineDash([1, 3]);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const v = yMax - (yMax - yMin) * i / 4;
      ctx.fillText(v.toFixed(digits), padL + plotW + 4, y + 3);
    }
    if (showMA && liveSeries.length > 20) {
      // MT5: MA line is thicker and more vivid
      ctx.strokeStyle = '#E91E63';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 19; i < liveSeries.length; i++) {
        let sum = 0;
        for (let j = i - 19; j <= i; j++) sum += liveSeries[j].c;
        const ma = sum / 20;
        const x = padL + cw * (i + 0.5);
        const y = y2p(ma);
        if (i === 19) ctx.moveTo(x, y);else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // ─── Bollinger Bands (20, 2) ───
    if (showBB && liveSeries.length > 20) {
      const N = 20,
        K = 2;
      const bb = [];
      for (let i = N - 1; i < liveSeries.length; i++) {
        let sum = 0;
        for (let j = i - N + 1; j <= i; j++) sum += liveSeries[j].c;
        const mean = sum / N;
        let vs = 0;
        for (let j = i - N + 1; j <= i; j++) {
          const d = liveSeries[j].c - mean;
          vs += d * d;
        }
        const sd = Math.sqrt(vs / N);
        bb.push({
          i,
          mid: mean,
          upper: mean + K * sd,
          lower: mean - K * sd
        });
      }
      // Shaded area between upper & lower
      ctx.fillStyle = 'rgba(33,150,243,0.08)';
      ctx.beginPath();
      bb.forEach((b, k) => {
        const x = padL + cw * (b.i + 0.5);
        const y = y2p(b.upper);
        if (k === 0) ctx.moveTo(x, y);else ctx.lineTo(x, y);
      });
      for (let k = bb.length - 1; k >= 0; k--) {
        const x = padL + cw * (bb[k].i + 0.5);
        const y = y2p(bb[k].lower);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      // Upper band (blue)
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      bb.forEach((b, k) => {
        const x = padL + cw * (b.i + 0.5);
        const y = y2p(b.upper);
        if (k === 0) ctx.moveTo(x, y);else ctx.lineTo(x, y);
      });
      ctx.stroke();
      // Lower band (blue)
      ctx.beginPath();
      bb.forEach((b, k) => {
        const x = padL + cw * (b.i + 0.5);
        const y = y2p(b.lower);
        if (k === 0) ctx.moveTo(x, y);else ctx.lineTo(x, y);
      });
      ctx.stroke();
      // Middle band (lighter)
      ctx.strokeStyle = 'rgba(33,150,243,0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      bb.forEach((b, k) => {
        const x = padL + cw * (b.i + 0.5);
        const y = y2p(b.mid);
        if (k === 0) ctx.moveTo(x, y);else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const bodyW = Math.max(3, cw * 0.75);
    liveSeries.forEach((c, i) => {
      const x = padL + cw * (i + 0.5);
      const up = c.c >= c.o;
      // MT5 vivid colors: brighter green, deeper red
      const col = up ? '#00A65A' : '#E63946';
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 1.5;
      // Wick line (thicker, more visible)
      ctx.beginPath();
      ctx.moveTo(x, y2p(c.h));
      ctx.lineTo(x, y2p(c.l));
      ctx.stroke();
      const bt = y2p(Math.max(c.o, c.c));
      const bb = y2p(Math.min(c.o, c.c));
      // Solid body (no transparency)
      ctx.fillRect(x - bodyW / 2, bt, bodyW, Math.max(1, bb - bt));
      // Body outline for extra crispness
      ctx.lineWidth = 1;
      ctx.strokeRect(x - bodyW / 2, bt, bodyW, Math.max(1, bb - bt));
    });
    const last = liveSeries[liveSeries.length - 1].c;
    const yL = y2p(last);
    // MT5 ask/bid horizontal line - dashed
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#1B3955';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, yL);
    ctx.lineTo(padL + plotW, yL);
    ctx.stroke();
    ctx.setLineDash([]);
    // MT5 price label box
    ctx.fillStyle = '#1B3955';
    const pillW = 54,
      pillH = 18;
    ctx.fillRect(padL + plotW + 2, yL - pillH / 2, pillW, pillH);
    ctx.fillStyle = '#fff';
    ctx.font = '700 10px "JetBrains Mono",monospace';
    ctx.textAlign = 'center';
    ctx.fillText(last.toFixed(digits), padL + plotW + 2 + pillW / 2, yL + 3);
    ctx.textAlign = 'left';
    // ─── Sub-panel layout (cumulative top positions) ───
    let subY = H - padB + 4;
    if (showVol) {
      const vMax = Math.max(...liveSeries.map(c => c.v));
      const vTop = subY;
      const vH = volH - 4;
      liveSeries.forEach((c, i) => {
        const x = padL + cw * (i + 0.5);
        const up = c.c >= c.o;
        ctx.fillStyle = up ? 'rgba(0,166,90,0.7)' : 'rgba(230,57,70,0.7)';
        const h = c.v / vMax * vH;
        ctx.fillRect(x - bodyW / 2, vTop + (vH - h), bodyW, h);
      });
      ctx.fillStyle = isDark ? '#8896AC' : '#5F6A7D';
      ctx.font = '9px "JetBrains Mono",monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Volume', padL + 2, vTop + 8);
      subY += volH + 4;
    }
    // ─── RSI(14) panel ───
    if (showRSI && liveSeries.length > 14) {
      const N = 14;
      const rsi = [];
      let avgG = 0,
        avgL = 0;
      for (let i = 1; i < liveSeries.length; i++) {
        const ch = liveSeries[i].c - liveSeries[i - 1].c;
        const g = Math.max(0, ch),
          l = Math.max(0, -ch);
        if (i <= N) {
          avgG += g;
          avgL += l;
          if (i === N) {
            avgG /= N;
            avgL /= N;
            const rs = avgL === 0 ? 100 : avgG / avgL;
            rsi.push({
              i,
              v: 100 - 100 / (1 + rs)
            });
          }
        } else {
          avgG = (avgG * (N - 1) + g) / N;
          avgL = (avgL * (N - 1) + l) / N;
          const rs = avgL === 0 ? 100 : avgG / avgL;
          rsi.push({
            i,
            v: 100 - 100 / (1 + rs)
          });
        }
      }
      const rTop = subY,
        rH = rsiH - 4,
        rBot = rTop + rH;
      const r2y = v => rTop + (1 - v / 100) * rH;
      // Panel background
      ctx.fillStyle = isDark ? 'rgba(31,42,60,0.4)' : 'rgba(245,247,250,0.7)';
      ctx.fillRect(padL, rTop, plotW, rH);
      // 70/30 levels
      ctx.strokeStyle = isDark ? '#3A4358' : '#D7DCE3';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(padL, r2y(70));
      ctx.lineTo(padL + plotW, r2y(70));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(padL, r2y(30));
      ctx.lineTo(padL + plotW, r2y(30));
      ctx.stroke();
      ctx.setLineDash([]);
      // RSI line
      ctx.strokeStyle = '#7B1FA2';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      rsi.forEach((r, k) => {
        const x = padL + cw * (r.i + 0.5);
        const y = r2y(r.v);
        if (k === 0) ctx.moveTo(x, y);else ctx.lineTo(x, y);
      });
      ctx.stroke();
      // Labels
      ctx.fillStyle = isDark ? '#8896AC' : '#5F6A7D';
      ctx.font = '9px "JetBrains Mono",monospace';
      ctx.textAlign = 'left';
      ctx.fillText('RSI(14)', padL + 2, rTop + 8);
      ctx.textAlign = 'right';
      ctx.fillText('70', padL + plotW + plotW * 0 + plotW * 0 + 4 + plotW * 0, r2y(70) + 3);
      ctx.textAlign = 'left';
      ctx.fillText('70', padL + plotW + 4, r2y(70) + 3);
      ctx.fillText('30', padL + plotW + 4, r2y(30) + 3);
      const lastRSI = rsi[rsi.length - 1].v;
      ctx.fillStyle = '#7B1FA2';
      ctx.fillRect(padL + plotW + 2, r2y(lastRSI) - 7, 40, 14);
      ctx.fillStyle = '#fff';
      ctx.font = '700 9px "JetBrains Mono",monospace';
      ctx.textAlign = 'center';
      ctx.fillText(lastRSI.toFixed(1), padL + plotW + 2 + 20, r2y(lastRSI) + 3);
      subY += rsiH + 4;
    }
    // ─── MACD(12,26,9) panel ───
    if (showMACD && liveSeries.length > 26) {
      const ema = (arr, period) => {
        const k = 2 / (period + 1);
        const out = [];
        let prev = null;
        arr.forEach((v, i) => {
          if (i === 0) {
            prev = v;
            out.push(v);
          } else {
            prev = v * k + prev * (1 - k);
            out.push(prev);
          }
        });
        return out;
      };
      const closes = liveSeries.map(c => c.c);
      const e12 = ema(closes, 12),
        e26 = ema(closes, 26);
      const macd = closes.map((_, i) => e12[i] - e26[i]);
      const signal = ema(macd, 9);
      const hist = macd.map((v, i) => v - signal[i]);
      const mTop = subY,
        mH = macdH - 4;
      const maxA = Math.max(...macd.slice(26).map(Math.abs), ...signal.slice(26).map(Math.abs), ...hist.slice(26).map(Math.abs), 1e-9);
      const m2y = v => mTop + (0.5 - v / (maxA * 2)) * mH;
      ctx.fillStyle = isDark ? 'rgba(31,42,60,0.4)' : 'rgba(245,247,250,0.7)';
      ctx.fillRect(padL, mTop, plotW, mH);
      // Zero line
      ctx.strokeStyle = isDark ? '#3A4358' : '#D7DCE3';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(padL, m2y(0));
      ctx.lineTo(padL + plotW, m2y(0));
      ctx.stroke();
      ctx.setLineDash([]);
      // Histogram bars
      for (let i = 26; i < liveSeries.length; i++) {
        const h = hist[i];
        const x = padL + cw * (i + 0.5);
        const y0 = m2y(0);
        const y1 = m2y(h);
        ctx.fillStyle = h >= 0 ? 'rgba(0,166,90,0.55)' : 'rgba(230,57,70,0.55)';
        ctx.fillRect(x - bodyW / 2, Math.min(y0, y1), bodyW, Math.abs(y1 - y0) || 1);
      }
      // MACD line (blue)
      ctx.strokeStyle = '#1976D2';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 26; i < liveSeries.length; i++) {
        const x = padL + cw * (i + 0.5);
        const y = m2y(macd[i]);
        if (i === 26) ctx.moveTo(x, y);else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Signal line (orange)
      ctx.strokeStyle = '#F57C00';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 26; i < liveSeries.length; i++) {
        const x = padL + cw * (i + 0.5);
        const y = m2y(signal[i]);
        if (i === 26) ctx.moveTo(x, y);else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = isDark ? '#8896AC' : '#5F6A7D';
      ctx.font = '9px "JetBrains Mono",monospace';
      ctx.textAlign = 'left';
      ctx.fillText('MACD(12,26,9)', padL + 2, mTop + 8);
      subY += macdH + 4;
    }
    ctx.fillStyle = isDark ? '#8896AC' : '#5F6A7D';
    ctx.font = '10px "JetBrains Mono",monospace';
    ctx.textAlign = 'center';
    const labelStep = Math.ceil(liveSeries.length / 5);
    for (let i = 0; i < liveSeries.length; i += labelStep) {
      const x = padL + cw * (i + 0.5);
      const stepsAgo = liveSeries.length - i;
      const cfg = TF_CONFIG[tf] || {
        label: 'min',
        step: 1
      };
      const total = stepsAgo * cfg.step;
      const lbl = stepsAgo === 0 ? 'now' : `${total}${cfg.label.charAt(0)}`;
      ctx.fillText(lbl, x, H - 6);
    }
    if (hover !== null) {
      const i = Math.min(hover, liveSeries.length - 1);
      const x = padL + cw * (i + 0.5);
      const c = liveSeries[i];
      ctx.strokeStyle = 'rgba(10,14,26,0.4)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#0A0E1A';
      ctx.beginPath();
      ctx.arc(x, y2p(c.c), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function onMove(e) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const padL = 6,
      padR = 56;
    const cw = (w - padL - padR) / liveSeries.length;
    const idx = Math.max(0, Math.min(liveSeries.length - 1, Math.floor((x - padL) / cw)));
    setHover(idx);
  }
  const hoverCandle = hover !== null && liveSeries ? liveSeries[Math.min(hover, liveSeries.length - 1)] : null;
  return /*#__PURE__*/React.createElement("div", {
    ref: wrapRef,
    style: {
      position: 'relative',
      width: '100%',
      height: fillContainer ? '100%' : 'auto',
      flex: fillContainer ? 1 : 'none'
    }
  }, /*#__PURE__*/React.createElement("canvas", {
    ref: ref,
    onMouseMove: onMove,
    onMouseLeave: () => setHover(null),
    onTouchMove: onMove,
    onTouchEnd: () => setHover(null)
  }), hoverCandle && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 6,
      left: 8,
      padding: '5px 8px',
      background: 'rgba(10,14,26,0.92)',
      color: '#fff',
      borderRadius: 6,
      fontFamily: 'JetBrains Mono,monospace',
      fontSize: 10,
      lineHeight: 1.5,
      pointerEvents: 'none',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#98A1B3'
    }
  }, "O "), hoverCandle.o.toFixed(digits), '  ', /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#98A1B3'
    }
  }, "H "), hoverCandle.h.toFixed(digits), '  ', /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#98A1B3'
    }
  }, "L "), hoverCandle.l.toFixed(digits), '  ', /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#98A1B3'
    }
  }, "C "), hoverCandle.c.toFixed(digits)));
}

// ── Helper UI components ──
function Seg({
  value,
  onChange,
  options
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      background: 'var(--bg-2)',
      borderRadius: 8,
      padding: 3
    }
  }, options.map(o => /*#__PURE__*/React.createElement("button", {
    key: o,
    onClick: () => onChange(o),
    style: {
      flex: 1,
      padding: '7px 0',
      borderRadius: 6,
      fontSize: 11.5,
      fontWeight: 700,
      letterSpacing: 0.3,
      background: value === o ? 'var(--surface)' : 'transparent',
      color: value === o ? 'var(--ink)' : 'var(--text-2)',
      boxShadow: value === o ? 'var(--shadow-sm)' : 'none'
    }
  }, o)));
}
function SumRow({
  label,
  val
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '5px 0',
      fontSize: 12.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      color: 'var(--ink)',
      fontWeight: 600
    }
  }, val));
}
function Card({
  label,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      borderRadius: 12,
      padding: '12px 14px',
      boxShadow: 'var(--shadow-sm)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.7,
      marginBottom: 9
    }
  }, label), children);
}
function Stat({
  label,
  val,
  color
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: color || 'var(--ink)',
      marginTop: 2
    }
  }, val));
}
function Meta({
  lbl,
  val,
  color
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      borderLeft: '1px solid var(--line)',
      padding: '2px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.4
    }
  }, lbl), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: color || 'var(--ink)',
      marginTop: 1
    }
  }, val));
}
function formatPriceFixed(n, digits) {
  const s = n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  if (digits >= 2) return {
    big: s.slice(0, -2),
    small: s.slice(-2)
  };
  return {
    big: s,
    small: ''
  };
}
// MT5-style 3-tier split: big figure (normal) · the 2 pip digits (large) · the last
// fractional-pip / pipette digit (small, raised). For 5-digit FX & 3-digit JPY/metals.
function formatPrice3(n, digits) {
  const s = n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  if (digits >= 3) return {
    big: s.slice(0, -3),
    pips: s.slice(-3, -1),
    pipette: s.slice(-1)
  };
  if (digits === 2) return {
    big: s.slice(0, -2),
    pips: s.slice(-2),
    pipette: ''
  };
  return {
    big: s,
    pips: '',
    pipette: ''
  };
}

// ── Watchlist ──
function getFavSyms() {
  try {
    return JSON.parse(localStorage.getItem('alpexa.favs') || '[]');
  } catch (e) {
    return [];
  }
}
function saveFavSyms(list) {
  try {
    localStorage.setItem('alpexa.favs', JSON.stringify(list));
  } catch (e) {}
}
function Watchlist({
  market,
  onSelect,
  current,
  onDepositCrypto
}) {
  const [filter, setFilter] = useState('FAV');
  const [search, setSearch] = useState('');
  const [favs, setFavs] = useState(getFavSyms());
  // ─── Trending Today (top 4 by total volume, auto-refreshed daily) ───
  // Trending = today's biggest movers by real % change (Twelve Data).
  // Prefer symbols that already have real data; refresh at most once a minute.
  // 4 (not 5) so the Deposit banner below stays visible on mobile.
  const trendingSymsRef = useRef(null);
  const trendingTsRef = useRef(0);
  (function () {
    const now = Date.now();
    if (trendingSymsRef.current && now - trendingTsRef.current < 60000) return;
    const byMove = arr => arr.slice().sort((a, b) => Math.abs(b.chgPct || 0) - Math.abs(a.chgPct || 0)).slice(0, 4).map(x => x.sym);
    const real = market.filter(s => s.real && isFinite(s.chgPct));
    let top4 = real.length >= 4 ? byMove(real) : byMove(market.filter(s => isFinite(s.chgPct)));
    if (top4.length === 4) {
      trendingSymsRef.current = top4;
      trendingTsRef.current = now;
    } else if (!trendingSymsRef.current) {
      trendingSymsRef.current = ['TSLA', 'NVDA', 'EURUSD', 'BTCUSD'];
    }
  })();
  function toggleFav(sym) {
    const next = favs.includes(sym) ? favs.filter(f => f !== sym) : [...favs, sym];
    setFavs(next);
    saveFavSyms(next);
  }
  const catsAll = [{
    id: 'FAV',
    label: 'Favorites'
  }, {
    id: 'FX',
    label: 'Forex'
  }, {
    id: 'STOCK',
    label: 'Stocks'
  }, {
    id: 'CRYPTO',
    label: 'Crypto'
  }, {
    id: 'INDEX',
    label: 'Indices'
  }];
  const feedMkt = alpexaTradable(market); // only symbols the server prices (feed-backed)
  function catCount(id) {
    if (id === 'FAV') return feedMkt.filter(s => favs.includes(s.sym)).length;
    return feedMkt.filter(s => s.cls === id).length;
  }
  // Hide a whole class tab once the feed is up and it has no tradeable symbols (e.g. no index feed).
  const cats = catsAll.filter(c => c.id === 'FAV' || !alpexaFeedReady() || catCount(c.id) > 0);
  const rows = feedMkt.filter(s => {
    if (filter === 'FAV') {
      if (!favs.includes(s.sym)) return false;
    } else if (s.cls !== filter) return false;
    if (search && !s.sym.toLowerCase().includes(search.toLowerCase()) && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      background: 'var(--bg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 14px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: 'var(--bg-2)',
      borderRadius: 3,
      color: 'var(--text-2)',
      border: '1px solid var(--line-2)'
    }
  }, ScreenIcons.search, /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Search symbol\u2026",
    style: {
      flex: 1,
      fontSize: 13,
      color: 'var(--text)'
    }
  })), /*#__PURE__*/React.createElement("button", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 3,
      background: '#1B3955',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '1px solid #0F2742'
    }
  }, ScreenIcons.plus)), /*#__PURE__*/React.createElement("div", {
    className: "cat-strip",
    style: {
      display: 'flex',
      gap: 6,
      padding: '10px 14px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      overflowX: 'auto',
      overflowY: 'hidden',
      scrollbarWidth: 'none',
      WebkitOverflowScrolling: 'touch',
      flexWrap: 'nowrap',
      cursor: 'grab',
      userSelect: 'none'
    }
  }, cats.map(c => {
    const active = filter === c.id;
    const count = catCount(c.id);
    return /*#__PURE__*/React.createElement("button", {
      key: c.id,
      onClick: () => setFilter(c.id),
      style: {
        padding: '6px 11px',
        borderRadius: 3,
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: 0.2,
        background: active ? '#1B3955' : 'var(--bg-2)',
        color: active ? '#fff' : 'var(--text-2)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        border: '1px solid ' + (active ? '#0F2742' : 'var(--line-2)')
      }
    }, /*#__PURE__*/React.createElement("span", null, c.id === 'FAV' ? '★ ' : '', tr(c.label)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        fontWeight: 700,
        padding: '1.5px 6px',
        borderRadius: 2,
        background: active ? 'rgba(255,255,255,0.18)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--text-3)',
        fontFamily: 'JetBrains Mono,monospace'
      }
    }, count));
  })), !(filter === 'FAV' && rows.length === 0) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      padding: '6px 14px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      fontSize: 9.5,
      color: 'var(--text-3)',
      fontWeight: 700,
      letterSpacing: 0.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 26
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, "SYMBOL"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 88,
      marginLeft: 6,
      textAlign: 'center'
    }
  }, "BID"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 42,
      textAlign: 'center'
    }
  }, "SPR"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 88,
      textAlign: 'center'
    }
  }, "ASK"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      overflowX: 'hidden',
      background: 'var(--surface)'
    }
  }, rows.length === 0 && filter === 'FAV' && (() => {
    const trending = trendingSymsRef.current.map(sym => market.find(m => m.sym === sym)).filter(Boolean).filter(m => !alpexaFeedReady() || alpexaHasFeed(m));
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '18px 16px 20px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14
      }
    }, "\uD83D\uDD25"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10.5,
        fontWeight: 700,
        color: 'var(--text-2)',
        letterSpacing: 0.6,
        textTransform: 'uppercase'
      }
    }, "Trending Today")), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--surface)',
        borderRadius: 3,
        border: '1px solid var(--line-2)',
        overflow: 'hidden'
      }
    }, trending.map((s, i) => {
      const up = s.chgPct >= 0;
      const fav = favs.includes(s.sym);
      const tagBg = {
        FX: '#E3F2FD',
        STOCK: '#E8F5E9',
        CRYPTO: '#FCE4EC',
        INDEX: '#EDE7F6'
      }[s.cls] || 'var(--bg-2)';
      const tagCol = {
        FX: '#1B3955',
        STOCK: '#2E7D32',
        CRYPTO: '#C2185B',
        INDEX: '#5E35B1'
      }[s.cls] || 'var(--text-3)';
      const now = new Date();
      const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
      const sprPt = ((ALPEXA_MARKET.fxAskPx(s) - ALPEXA_MARKET.fxBidPx(s)) * Math.pow(10, s.digits)).toFixed(0); // LIVE dealt spread (display lockstep)
      return /*#__PURE__*/React.createElement("div", {
        key: s.sym,
        style: {
          display: 'flex',
          alignItems: 'center',
          padding: '14px 14px',
          gap: 12,
          borderTop: i === 0 ? 'none' : '1px solid var(--line)',
          borderLeft: fav ? '3px solid #FBBF24' : '3px solid transparent',
          paddingLeft: fav ? 11 : 14
        }
      }, /*#__PURE__*/React.createElement("button", {
        onClick: () => onSelect(s.sym),
        style: {
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          padding: 0,
          background: 'transparent',
          textAlign: 'left',
          gap: 8
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          flex: '1 1 0',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 1
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 5
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--ink)',
          letterSpacing: 0.2,
          lineHeight: 1.1
        }
      }, s.sym), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 8,
          padding: '1px 4px',
          borderRadius: 3,
          fontWeight: 800,
          letterSpacing: 0.4,
          background: tagBg,
          color: tagCol
        }
      }, s.cls)), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 9.5,
          color: 'var(--text-3)',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }
      }, s.name), /*#__PURE__*/React.createElement("div", {
        className: "mono",
        style: {
          fontSize: 9,
          color: 'var(--muted)',
          fontWeight: 500,
          letterSpacing: 0.2,
          marginTop: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: '#4CAF50',
          flexShrink: 0
        }
      }), timeStr, /*#__PURE__*/React.createElement("span", {
        style: {
          marginLeft: 4,
          color: 'var(--text-2)',
          fontWeight: 700
        }
      }, sprPt))), /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 1,
          flexShrink: 0
        }
      }, /*#__PURE__*/React.createElement("span", {
        className: "mono",
        style: {
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--ink)',
          lineHeight: 1.15
        }
      }, ALPEXA_MARKET.fmt(s.last, s.digits)), /*#__PURE__*/React.createElement("span", {
        className: "mono",
        style: {
          fontSize: 9,
          color: 'var(--text-3)',
          lineHeight: 1.2,
          letterSpacing: 0.1
        }
      }, "L ", ALPEXA_MARKET.fmt(s.low, s.digits), " \xB7 H ", ALPEXA_MARKET.fmt(s.high, s.digits))), /*#__PURE__*/React.createElement("span", {
        className: "mono",
        style: {
          fontSize: 11.5,
          fontWeight: 700,
          minWidth: 52,
          textAlign: 'right',
          color: up ? '#2E6FB0' : '#E04141',
          flexShrink: 0
        }
      }, up ? '+' : '', s.chgPct.toFixed(2), "%")));
    })), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        if (onDepositCrypto) onDepositCrypto();
      },
      style: {
        width: '100%',
        marginTop: 12,
        padding: '12px 14px',
        background: 'var(--surface)',
        borderRadius: 3,
        border: '1px solid var(--line-2)',
        color: 'var(--ink)',
        textAlign: 'left',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        marginBottom: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 8,
        fontWeight: 800,
        padding: '1px 5px',
        borderRadius: 2,
        letterSpacing: 0.5,
        background: 'var(--acc-3)',
        color: 'var(--acc-2)'
      }
    }, "NEW"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 8.5,
        fontWeight: 700,
        color: 'var(--text-3)',
        letterSpacing: 0.4
      }
    }, "CRYPTO WALLET")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        fontSize: 12.5,
        fontWeight: 700,
        lineHeight: 1.3,
        letterSpacing: 0.1,
        color: 'var(--ink)'
      }
    }, "Bring your crypto into Alpexa FX"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10.5,
        fontWeight: 700,
        color: '#fff',
        background: 'var(--acc)',
        padding: '6px 11px',
        borderRadius: 3,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        letterSpacing: 0.3,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        border: '1px solid #0F2742'
      }
    }, "Deposit ", /*#__PURE__*/React.createElement(Mi, {
      name: "arrow_forward",
      size: 11
    })))));
  })(), rows.map(s => {
    const ask = ALPEXA_MARKET.fxAskPx(s);
    const up = s.chgPct >= 0;
    const sel = current === s.sym;
    const fav = favs.includes(s.sym); // dealt ask (display lockstep)
    const flashClass = s.flash === 'up' ? 'flash-up' : s.flash === 'down' ? 'flash-down' : '';
    return /*#__PURE__*/React.createElement("div", {
      key: s.sym,
      className: flashClass,
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid var(--line)',
        background: sel ? 'rgba(46,111,176,0.16)' : 'transparent',
        borderLeft: sel ? '3px solid #1B3955' : '3px solid transparent'
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: e => {
        e.stopPropagation();
        toggleFav(s.sym);
      },
      style: {
        width: 26,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: fav ? '#FBBF24' : 'var(--muted)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 16,
        fontVariationSettings: `'FILL' ${fav ? 1 : 0}, 'wght' 500, 'GRAD' 0, 'opsz' 24`
      }
    }, "star")), /*#__PURE__*/React.createElement("button", {
      onClick: () => onSelect(s.sym),
      style: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        padding: 0,
        textAlign: 'left',
        background: 'transparent'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13.5,
        fontWeight: 700,
        color: 'var(--ink)',
        letterSpacing: 0.2,
        flexShrink: 0
      }
    }, s.sym), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 8.5,
        padding: '1px 5px',
        borderRadius: 3,
        background: 'var(--bg-2)',
        color: 'var(--text-3)',
        fontWeight: 700,
        letterSpacing: 0.4,
        flexShrink: 0
      }
    }, s.cls)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10.5,
        color: 'var(--text-3)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, s.name)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        width: 88,
        marginLeft: 6,
        textAlign: 'center',
        fontWeight: 600,
        color: '#E04141',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        alignItems: 'baseline'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12
      }
    }, formatPrice3(s.last, s.digits).big), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 16.5,
        fontWeight: 800
      }
    }, formatPrice3(s.last, s.digits).pips), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: 700,
        alignSelf: 'flex-start'
      }
    }, formatPrice3(s.last, s.digits).pipette)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        color: 'var(--text-3)',
        fontWeight: 500
      }
    }, "L ", ALPEXA_MARKET.fmt(s.low, s.digits))), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        width: 42,
        textAlign: 'center',
        display: 'flex',
        justifyContent: 'center',
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        fontWeight: 600,
        color: 'var(--text-3)',
        lineHeight: 1.1
      }
    }, ((ALPEXA_MARKET.fxAskPx(s) - ALPEXA_MARKET.fxBidPx(s)) * Math.pow(10, s.digits)).toFixed(0))), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        width: 88,
        textAlign: 'center',
        fontWeight: 600,
        color: '#2E6FB0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        alignItems: 'baseline'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12
      }
    }, formatPrice3(ask, s.digits).big), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 16.5,
        fontWeight: 800
      }
    }, formatPrice3(ask, s.digits).pips), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: 700,
        alignSelf: 'flex-start'
      }
    }, formatPrice3(ask, s.digits).pipette)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        color: 'var(--text-3)',
        fontWeight: 500
      }
    }, "H ", ALPEXA_MARKET.fmt(s.high, s.digits))), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6
      }
    })));
  })));
}

// ── TradeTicket ──
function TradeTicket({
  market,
  sym,
  setSym,
  lots,
  setLots,
  onPlace
}) {
  const s = market.find(m => m.sym === sym);
  const [side, setSide] = useState('BUY');
  const [otype, setOtype] = useState('MARKET');
  const [otypePrice, setOtypePrice] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFilter, setPickerFilter] = useState('ALL');
  const [pickerSearch, setPickerSearch] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const vol = lots;
  const setVol = setLots;
  const cryptoUsdRef = useRef(500); // desired USD size for crypto orders
  const prevClsRef = useRef(s ? s.cls : null);
  useEffect(() => {
    if (!s) return;
    const px = s.last || s.bid || 1;
    const classChanged = prevClsRef.current !== s.cls;
    prevClsRef.current = s.cls;
    // Crypto is sized in USD: keep ~the same dollar amount as you switch coins.
    if (s.cls === 'CRYPTO') {
      setLots(+(cryptoUsdRef.current / px).toFixed(6));
    } else if (classChanged) {
      setLots(s.cls === 'STOCK' || s.cls === 'INDEX' ? 1 : 0.10);
    }
  }, [s && s.cls, s && s.sym]);
  const ask = ALPEXA_MARKET.fxAskPx(s);
  const entryPx = side === 'BUY' ? ask : ALPEXA_MARKET.fxBidPx(s); // entry at the DEALT quote (display lockstep)
  const notional = ALPEXA_MARKET.getNotionalUSD(s, vol, entryPx);
  const levSettings = getLeverageSettings();
  const lev = levSettings[s.cls] || (s.cls === 'STOCK' ? 5 : s.cls === 'CRYPTO' ? 5 : s.cls === 'INDEX' ? 20 : 100);
  const marginPct = (100 / lev).toFixed(lev < 10 ? 0 : 1);
  const margin = notional / lev;
  // Crypto order sizing in USD (internal vol stays in coins, so all the math below is unchanged).
  const coinSym = s.sym.replace('USD', '');
  const cryptoUsd = vol * entryPx;
  const cryptoStep = cryptoUsd <= 100 ? 10 : cryptoUsd <= 1000 ? 50 : 100;
  const setCryptoUsd = u => {
    const nu = Math.max(10, u);
    cryptoUsdRef.current = nu;
    setVol(+(nu / entryPx).toFixed(6));
  };
  const commission = s.cls === 'STOCK' ? Math.max(1, vol * 0.02) : s.cls === 'CRYPTO' ? notional * 0.001 : 0;
  const lotSize = ALPEXA_MARKET.getLotSize(s);
  const tickSize = Math.pow(10, -s.digits);
  // USD value of one point — derived from the (USD-correct) P&L of a 1-point move,
  // so cross pairs like EURJPY convert to USD just like the position P&L does.
  const tickValueUSD = Math.abs(ALPEXA_MARKET.getPnlUSD(s, entryPx, entryPx + tickSize, 'BUY', vol));
  // Standard PIP value (matches MT4/MT5 & other brokers): a pip is 10 POINTS on
  // fractional-pip quotes (5-digit FX, 3-digit JPY/metals), else 1 point. The
  // tickValueUSD above is the POINT value; multiply to get the true pip value.
  // (Display only — SL/TP distances stay in points and their $ amounts are already
  // correct = point value × points.)
  const pipFactor = s.cls === 'FX' && (s.digits === 5 || s.digits === 3) ? 10 : 1;
  const pipValueUSD = tickValueUSD * pipFactor;
  function sltpHelper(val, isTp) {
    if (val === '' || val == null) return null;
    const rawStr = String(val).trim();
    let p = parseFloat(rawStr);
    if (isNaN(p) || p === 0) return null;
    p = Math.abs(p);
    let targetPx;
    const tickSizeLocal = Math.pow(10, -s.digits);
    const hasDecimal = rawStr.includes('.');
    const isPipMode = !hasDecimal || p < entryPx * 0.5;
    if (isPipMode) {
      const offset = p * tickSizeLocal;
      if (isTp) targetPx = side === 'BUY' ? entryPx + offset : entryPx - offset;else targetPx = side === 'BUY' ? entryPx - offset : entryPx + offset;
    } else targetPx = p;
    const dist = Math.abs(entryPx - targetPx) * Math.pow(10, s.digits);
    const amt = tickValueUSD * dist;
    const pctAway = Math.abs(entryPx - targetPx) / entryPx;
    return {
      dist: dist.toFixed(0),
      amt: amt.toFixed(2),
      invalid: pctAway > 0.30,
      tooClose: dist < 10,
      pctAway: (pctAway * 100).toFixed(1),
      targetPx: targetPx.toFixed(s.digits),
      asPipsInput: isPipMode
    };
  }
  const slH = sltpHelper(sl, false);
  const tpH = sltpHelper(tp, true);
  let contractLabel;
  if (s.cls === 'FX') {
    if (s.sym === 'XAUUSD') contractLabel = `${(100 * vol).toFixed(2)} oz`;else if (s.sym === 'XAGUSD') contractLabel = `${(5000 * vol).toFixed(0)} oz`;else contractLabel = `${(100000 * vol).toLocaleString('en-US', {
      maximumFractionDigits: 0
    })} ${s.sym.slice(0, 3)}`;
  } else if (s.cls === 'CRYPTO') contractLabel = `${vol.toFixed(2)} ${s.sym.replace('USD', '')}`;else if (s.cls === 'STOCK') contractLabel = `${vol.toFixed(0)} ${vol === 1 ? 'share' : 'shares'}`;else contractLabel = `${vol.toFixed(2)} units`;
  const tagBg = {
    FX: 'var(--acc-3)',
    STOCK: 'var(--buy-tint)',
    CRYPTO: '#FCE4EC',
    INDEX: '#EDE7F6'
  };
  const tagCol = {
    FX: 'var(--acc-2)',
    STOCK: 'var(--buy-2)',
    CRYPTO: '#C2185B',
    INDEX: '#5E35B1'
  };
  function place() {
    setConfirmOpen(false);
    if (!onPlace) return;
    const trigger = otype === 'MARKET' ? null : parseFloat(otypePrice);
    const order = {
      sym: s.sym,
      side,
      vol,
      open: otype === 'MARKET' ? entryPx : trigger,
      trigger,
      sl: slH ? parseFloat(slH.targetPx) : 0,
      tp: tpH ? parseFloat(tpH.targetPx) : 0,
      otype,
      swap: 0
    };
    onPlace(order);
  }
  function submit() {
    if (getPrefs().oneClick && otype === 'MARKET' && canPlace) place();else if (canPlace) setConfirmOpen(true);
  }
  const canPlace = (otype === 'MARKET' || otypePrice && !isNaN(parseFloat(otypePrice)) && parseFloat(otypePrice) > 0) && (!slH || !slH.invalid && !slH.tooClose) && (!tpH || !tpH.invalid && !tpH.tooClose);
  const bidParts = formatPrice3(s.last, s.digits);
  const askParts = formatPrice3(ask, s.digits);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      background: 'var(--bg)',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setPickerOpen(true),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 14px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      textAlign: 'left',
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 800,
      color: 'var(--ink)',
      letterSpacing: 0.2
    }
  }, s.sym), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 8.5,
      padding: '2px 5px',
      borderRadius: 3,
      fontWeight: 800,
      letterSpacing: 0.4,
      background: tagBg[s.cls] || 'var(--bg-2)',
      color: tagCol[s.cls] || 'var(--text-2)'
    }
  }, s.cls), !s.real && /*#__PURE__*/React.createElement("span", {
    title: "Indicative price \u2014 no live market feed for this symbol",
    style: {
      fontSize: 8.5,
      padding: '2px 5px',
      borderRadius: 3,
      fontWeight: 800,
      letterSpacing: 0.4,
      background: '#fdeaea',
      color: '#c0392b'
    }
  }, "SIMULATED")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--text-3)',
      marginTop: 2
    }
  }, s.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 15,
      background: 'var(--bg-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-2)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "unfold_more",
    size: 18
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      padding: '12px 12px 8px',
      background: 'var(--bg)',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setSide('SELL'),
    style: {
      flex: 1,
      padding: '11px 12px 13px',
      borderRadius: 4,
      textAlign: 'left',
      background: side === 'SELL' ? 'rgba(224,65,65,0.16)' : 'var(--surface)',
      border: side === 'SELL' ? '1.5px solid #E04141' : '1.5px solid var(--line-2)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 800,
      color: '#E04141',
      letterSpacing: 0.8
    }
  }, "SELL \xB7 BID"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      display: 'flex',
      alignItems: 'baseline',
      color: '#E04141',
      fontWeight: 700,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 20
    }
  }, bidParts.big), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 27,
      fontWeight: 800
    }
  }, bidParts.pips), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      alignSelf: 'flex-start',
      marginTop: 1
    }
  }, bidParts.pipette)), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      marginTop: 4
    }
  }, "L ", ALPEXA_MARKET.fmt(s.low, s.digits))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setSide('BUY'),
    style: {
      flex: 1,
      padding: '11px 12px 13px',
      borderRadius: 4,
      textAlign: 'left',
      background: side === 'BUY' ? 'rgba(46,111,176,0.16)' : 'var(--surface)',
      border: side === 'BUY' ? '1.5px solid #2E6FB0' : '1.5px solid var(--line-2)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 800,
      color: '#2E6FB0',
      letterSpacing: 0.8
    }
  }, "BUY \xB7 ASK"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      display: 'flex',
      alignItems: 'baseline',
      color: '#2E6FB0',
      fontWeight: 700,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 20
    }
  }, askParts.big), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 27,
      fontWeight: 800
    }
  }, askParts.pips), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      alignSelf: 'flex-start',
      marginTop: 1
    }
  }, askParts.pipette)), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      marginTop: 4
    }
  }, "H ", ALPEXA_MARKET.fmt(s.high, s.digits))), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%,-50%)',
      background: '#1B3955',
      color: '#fff',
      padding: '3px 8px',
      borderRadius: 3,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.5
    }
  }, ((ALPEXA_MARKET.fxAskPx(s) - ALPEXA_MARKET.fxBidPx(s)) * Math.pow(10, s.digits)).toFixed(0))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '4px 12px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      borderRadius: 4,
      padding: '12px 14px',
      border: '1px solid var(--line-2)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.7,
      marginBottom: 9
    }
  }, "ORDER TYPE"), /*#__PURE__*/React.createElement(Seg, {
    value: otype,
    onChange: setOtype,
    options: ['MARKET', 'LIMIT', 'STOP']
  }), otype !== 'MARKET' && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      marginBottom: 5
    }
  }, "TRIGGER PRICE"), /*#__PURE__*/React.createElement("input", {
    value: otypePrice,
    onChange: e => setOtypePrice(e.target.value),
    placeholder: ALPEXA_MARKET.fmt(entryPx, s.digits),
    className: "mono",
    style: {
      width: '100%',
      borderBottom: '1.5px solid var(--line-2)',
      padding: '5px 0',
      fontSize: 15,
      color: 'var(--ink)',
      fontWeight: 600,
      outline: 'none'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      borderRadius: 4,
      padding: '12px 14px',
      border: '1px solid var(--line-2)'
    }
  }, s.cls === 'CRYPTO' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.7,
      marginBottom: 10
    }
  }, "AMOUNT (USD)"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setCryptoUsd(cryptoUsd - cryptoStep),
    style: {
      width: 38,
      height: 38,
      borderRadius: 19,
      background: 'var(--bg-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--ink)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "remove",
    size: 20,
    weight: 600
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 28,
      fontWeight: 700,
      color: 'var(--ink)',
      lineHeight: 1,
      letterSpacing: -0.5
    }
  }, "$", cryptoUsd.toLocaleString('en-US', {
    maximumFractionDigits: 0
  })), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      marginTop: 5,
      letterSpacing: 0.3
    }
  }, "\u2248 ", vol.toLocaleString('en-US', {
    maximumFractionDigits: vol < 1 ? 6 : 2
  }), " ", coinSym)), /*#__PURE__*/React.createElement("button", {
    onClick: () => setCryptoUsd(cryptoUsd + cryptoStep),
    style: {
      width: 38,
      height: 38,
      borderRadius: 19,
      background: 'var(--bg-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--ink)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "add",
    size: 20,
    weight: 600
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 5
    }
  }, [50, 100, 500, 1000, 5000].map(u => /*#__PURE__*/React.createElement("button", {
    key: u,
    onClick: () => setCryptoUsd(u),
    className: "mono",
    style: {
      flex: 1,
      padding: '6px 0',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 600,
      background: Math.abs(cryptoUsd - u) < 1 ? 'var(--ink)' : 'var(--bg-2)',
      color: Math.abs(cryptoUsd - u) < 1 ? 'var(--ink-fg)' : 'var(--text-2)'
    }
  }, "$", u >= 1000 ? u / 1000 + 'k' : u)))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.7,
      marginBottom: 10
    }
  }, "VOLUME (", ALPEXA_MARKET.getUnitLabel(s.cls).toUpperCase(), ")"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      const step = s.cls === 'STOCK' ? vol <= 1 ? 1 : vol <= 10 ? 1 : vol <= 100 ? 5 : 10 : s.cls === 'INDEX' ? 1 : vol < 0.1 ? 0.01 : vol < 1 ? 0.10 : vol < 10 ? 1 : 5;
      const min = s.cls === 'STOCK' || s.cls === 'INDEX' ? 1 : 0.01;
      setVol(Math.max(min, +(vol - step).toFixed(2)));
    },
    style: {
      width: 38,
      height: 38,
      borderRadius: 19,
      background: 'var(--bg-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--ink)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "remove",
    size: 20,
    weight: 600
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 28,
      fontWeight: 700,
      color: 'var(--ink)',
      lineHeight: 1,
      letterSpacing: -0.5
    }
  }, ALPEXA_MARKET.fmtVol(s.cls, vol)), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      marginTop: 5,
      letterSpacing: 0.3
    }
  }, "\u2248 $", notional.toLocaleString('en-US', {
    maximumFractionDigits: 0
  }), " notional")), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      const step = s.cls === 'STOCK' ? vol < 1 ? 1 : vol < 10 ? 1 : vol < 100 ? 5 : 10 : s.cls === 'INDEX' ? 1 : vol < 0.1 ? 0.01 : vol < 1 ? 0.10 : vol < 10 ? 1 : 5;
      setVol(+(vol + step).toFixed(2));
    },
    style: {
      width: 38,
      height: 38,
      borderRadius: 19,
      background: 'var(--bg-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--ink)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "add",
    size: 20,
    weight: 600
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 5
    }
  }, (s.cls === 'STOCK' ? [1, 5, 10, 50, 100] : s.cls === 'INDEX' ? [1, 2, 5, 10, 20] : [0.01, 0.10, 0.50, 1.00, 5.00]).map(p => /*#__PURE__*/React.createElement("button", {
    key: p,
    onClick: () => setVol(p),
    className: "mono",
    style: {
      flex: 1,
      padding: '6px 0',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 600,
      background: Math.abs(vol - p) < 0.001 ? 'var(--ink)' : 'var(--bg-2)',
      color: Math.abs(vol - p) < 0.001 ? 'var(--ink-fg)' : 'var(--text-2)'
    }
  }, ALPEXA_MARKET.fmtVol(s.cls, p)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      borderRadius: 4,
      padding: '12px 14px',
      border: '1px solid var(--line-2)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.7,
      marginBottom: 10
    }
  }, "STOP LOSS / TAKE PROFIT"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 800,
      color: 'var(--sell)',
      letterSpacing: 0.5,
      marginBottom: 5,
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "shield",
    size: 12
  }), " STOP LOSS"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      borderBottom: '1.5px solid var(--line-2)',
      paddingBottom: 5
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: sl,
    onChange: e => setSl(e.target.value),
    placeholder: "\u2014",
    type: "number",
    step: "any",
    className: "mono",
    style: {
      flex: 1,
      fontSize: 15,
      color: 'var(--ink)',
      fontWeight: 600,
      outline: 'none',
      width: '100%'
    }
  }), sl && /*#__PURE__*/React.createElement("button", {
    onClick: () => setSl(''),
    style: {
      color: 'var(--text-3)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "close",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 9.5,
      marginTop: 5,
      color: slH ? slH.invalid || slH.tooClose ? 'var(--warn)' : 'var(--sell)' : 'var(--text-3)'
    }
  }, slH ? slH.invalid ? `⚠ ${slH.pctAway}% off entry` : slH.tooClose ? `⚠ Min 10 pt required (now ${slH.dist} pt)` : `${slH.asPipsInput ? '→ ' + slH.targetPx + ' · ' : ''}${slH.dist} pt · −$${slH.amt}` : 'No SL set')), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 800,
      color: 'var(--buy)',
      letterSpacing: 0.5,
      marginBottom: 5,
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "flag",
    size: 12
  }), " TAKE PROFIT"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      borderBottom: '1.5px solid var(--line-2)',
      paddingBottom: 5
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: tp,
    onChange: e => setTp(e.target.value),
    placeholder: "\u2014",
    type: "number",
    step: "any",
    className: "mono",
    style: {
      flex: 1,
      fontSize: 15,
      color: 'var(--ink)',
      fontWeight: 600,
      outline: 'none',
      width: '100%'
    }
  }), tp && /*#__PURE__*/React.createElement("button", {
    onClick: () => setTp(''),
    style: {
      color: 'var(--text-3)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "close",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 9.5,
      marginTop: 5,
      color: tpH ? tpH.invalid || tpH.tooClose ? 'var(--warn)' : 'var(--buy)' : 'var(--text-3)'
    }
  }, tpH ? tpH.invalid ? `⚠ ${tpH.pctAway}% off entry` : tpH.tooClose ? `⚠ Min 10 pt required (now ${tpH.dist} pt)` : `${tpH.asPipsInput ? '→ ' + tpH.targetPx + ' · ' : ''}${tpH.dist} pt · +$${tpH.amt}` : 'No TP set')))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      borderRadius: 4,
      padding: '12px 14px',
      border: '1px solid var(--line-2)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.7,
      marginBottom: 6
    }
  }, "ORDER SUMMARY"), /*#__PURE__*/React.createElement(SumRow, {
    label: "Notional value",
    val: `$${notional.toLocaleString('en-US', {
      maximumFractionDigits: 2
    })}`
  }), /*#__PURE__*/React.createElement(SumRow, {
    label: "Contract size",
    val: contractLabel
  }), /*#__PURE__*/React.createElement(SumRow, {
    label: "Required margin",
    val: `$${margin.toLocaleString('en-US', {
      maximumFractionDigits: 2
    })} (${marginPct}%)`
  }), /*#__PURE__*/React.createElement(SumRow, {
    label: "Leverage",
    val: `1:${lev}`
  }), /*#__PURE__*/React.createElement(SumRow, {
    label: "Commission",
    val: `$${commission.toFixed(2)}`
  }), /*#__PURE__*/React.createElement(SumRow, {
    label: s.cls === 'FX' ? 'Pip value (1 pip)' : `Tick value (${tickSize.toFixed(s.digits)})`,
    val: `$${(s.cls === 'FX' ? pipValueUSD : tickValueUSD).toFixed(s.cls === 'FX' ? 2 : 4)}`
  }), /*#__PURE__*/React.createElement(SumRow, {
    label: "Swap (overnight)",
    val: s.cls === 'CRYPTO' ? '−12.0' : s.cls === 'STOCK' ? '−3.5' : side === 'BUY' ? '−0.5' : '+0.2'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 12px 12px',
      background: 'var(--surface)',
      borderTop: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: submit,
    disabled: !canPlace,
    style: {
      width: '100%',
      padding: '14px 0',
      borderRadius: 4,
      fontSize: 14,
      fontWeight: 800,
      color: '#fff',
      background: !canPlace ? 'var(--muted)' : side === 'BUY' ? 'linear-gradient(180deg,#3A7CC0 0%,#1F5A95 100%)' : 'linear-gradient(180deg,#E84A4A 0%,#C92F2F 100%)',
      letterSpacing: 0.5,
      cursor: canPlace ? 'pointer' : 'not-allowed',
      border: canPlace ? '1px solid ' + (side === 'BUY' ? '#194B7F' : '#A82424') : '1px solid var(--muted)',
      boxShadow: canPlace ? '0 1px 0 rgba(255,255,255,0.18) inset,0 2px 4px rgba(0,0,0,0.15)' : 'none',
      textShadow: canPlace ? '0 1px 1px rgba(0,0,0,0.15)' : 'none'
    }
  }, otype !== 'MARKET' && !canPlace ? 'Enter trigger price' : /*#__PURE__*/React.createElement(React.Fragment, null, side === 'BUY' ? 'BUY' : 'SELL', otype !== 'MARKET' ? ` ${otype}` : '', " \xB7 ", ALPEXA_MARKET.fmtVol(s.cls, vol), " ", ALPEXA_MARKET.getUnitLabel(s.cls), " of ", sym, " @ ", /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, ALPEXA_MARKET.fmt(otype === 'MARKET' ? entryPx : parseFloat(otypePrice) || entryPx, s.digits))))), pickerOpen && (() => {
    const pickerCats = [{
      id: 'ALL',
      label: 'All'
    }, {
      id: 'FX',
      label: 'Forex'
    }, {
      id: 'STOCK',
      label: 'Stocks'
    }, {
      id: 'CRYPTO',
      label: 'Crypto'
    }, {
      id: 'INDEX',
      label: 'Indices'
    }];
    const feedPick = alpexaTradable(market); // only server-priced symbols
    const pickerCount = id => id === 'ALL' ? feedPick.length : feedPick.filter(m => m.cls === id).length;
    const pickerRows = feedPick.filter(m => {
      if (pickerFilter !== 'ALL' && m.cls !== pickerFilter) return false;
      if (pickerSearch && !m.sym.toLowerCase().includes(pickerSearch.toLowerCase()) && !(m.name || '').toLowerCase().includes(pickerSearch.toLowerCase())) return false;
      return true;
    });
    return /*#__PURE__*/React.createElement("div", {
      onClick: () => setPickerOpen(false),
      style: {
        position: 'absolute',
        inset: 0,
        background: 'rgba(10,14,26,0.55)',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end'
      }
    }, /*#__PURE__*/React.createElement("div", {
      onClick: e => e.stopPropagation(),
      style: {
        background: 'var(--surface)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: '82%',
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'center',
        padding: '8px 0 4px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 36,
        height: 4,
        borderRadius: 2,
        background: 'var(--line-2)'
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '6px 16px 10px',
        display: 'flex',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 15,
        fontWeight: 700,
        color: 'var(--ink)'
      }
    }, "Select Symbol"), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("button", {
      onClick: () => setPickerOpen(false),
      style: {
        width: 28,
        height: 28,
        borderRadius: 14,
        background: 'var(--bg-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-2)'
      }
    }, /*#__PURE__*/React.createElement(Mi, {
      name: "close",
      size: 14
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '0 14px 8px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'var(--bg-2)',
        borderRadius: 3,
        border: '1px solid var(--line-2)'
      }
    }, /*#__PURE__*/React.createElement(Mi, {
      name: "search",
      size: 16,
      style: {
        color: 'var(--text-3)'
      }
    }), /*#__PURE__*/React.createElement("input", {
      value: pickerSearch,
      onChange: e => setPickerSearch(e.target.value),
      placeholder: "Search symbol\u2026",
      style: {
        flex: 1,
        fontSize: 13,
        color: 'var(--ink)',
        background: 'transparent',
        outline: 'none',
        border: 'none'
      }
    }), pickerSearch && /*#__PURE__*/React.createElement("button", {
      onClick: () => setPickerSearch(''),
      style: {
        color: 'var(--text-3)'
      }
    }, /*#__PURE__*/React.createElement(Mi, {
      name: "close",
      size: 14
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 6,
        padding: '0 14px 10px',
        overflowX: 'auto',
        flexWrap: 'nowrap',
        borderBottom: '1px solid var(--line)'
      }
    }, pickerCats.map(c => {
      const active = pickerFilter === c.id;
      const cnt = pickerCount(c.id);
      return /*#__PURE__*/React.createElement("button", {
        key: c.id,
        onClick: () => setPickerFilter(c.id),
        style: {
          padding: '6px 11px',
          borderRadius: 3,
          fontSize: 11.5,
          fontWeight: 600,
          letterSpacing: 0.2,
          background: active ? '#1B3955' : 'var(--bg-2)',
          color: active ? '#fff' : 'var(--text-2)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          border: '1px solid ' + (active ? '#0F2742' : 'var(--line-2)')
        }
      }, /*#__PURE__*/React.createElement("span", null, c.label), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 9.5,
          fontWeight: 700,
          padding: '1.5px 6px',
          borderRadius: 2,
          background: active ? 'rgba(255,255,255,0.18)' : 'var(--surface)',
          color: active ? '#fff' : 'var(--text-3)',
          fontFamily: 'JetBrains Mono,monospace'
        }
      }, cnt));
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflowY: 'auto'
      }
    }, pickerRows.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '32px 16px',
        textAlign: 'center',
        color: 'var(--text-3)',
        fontSize: 12
      }
    }, "No symbols match this filter."), pickerRows.map(m => {
      const a = ALPEXA_MARKET.fxAskPx(m);
      const b = ALPEXA_MARKET.fxBidPx(m);
      const sel = m.sym === sym;
      return (
        /*#__PURE__*/
        // dealt quotes (display lockstep)
        React.createElement("button", {
          key: m.sym,
          onClick: () => {
            setSym(m.sym);
            setPickerOpen(false);
          },
          style: {
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '11px 16px',
            borderBottom: '1px solid var(--line)',
            textAlign: 'left',
            background: sel ? 'var(--acc-3)' : 'transparent'
          }
        }, /*#__PURE__*/React.createElement("span", {
          style: {
            fontSize: 13.5,
            fontWeight: 700,
            color: 'var(--ink)',
            flex: 1
          }
        }, m.sym), /*#__PURE__*/React.createElement("span", {
          style: {
            fontSize: 8.5,
            padding: '2px 5px',
            borderRadius: 3,
            fontWeight: 800,
            letterSpacing: 0.4,
            background: tagBg[m.cls] || 'var(--bg-2)',
            color: tagCol[m.cls] || 'var(--text-2)'
          }
        }, m.cls), /*#__PURE__*/React.createElement("span", {
          className: "mono",
          style: {
            fontSize: 12,
            color: '#E04141',
            fontWeight: 600,
            width: 70,
            textAlign: 'right'
          }
        }, ALPEXA_MARKET.fmt(b, m.digits)), /*#__PURE__*/React.createElement("span", {
          className: "mono",
          style: {
            fontSize: 12,
            color: '#2E6FB0',
            fontWeight: 600,
            width: 70,
            textAlign: 'right'
          }
        }, ALPEXA_MARKET.fmt(a, m.digits)), sel && /*#__PURE__*/React.createElement(Mi, {
          name: "check_circle",
          size: 16,
          style: {
            color: 'var(--acc-2)'
          }
        }))
      );
    }))));
  })(), confirmOpen && (() => {
    const sideCol = side === 'BUY' ? '#2E6FB0' : '#E04141';
    const sideColDark = side === 'BUY' ? '#1F5A95' : '#C92F2F';
    const sideColDarker = side === 'BUY' ? '#194B7F' : '#A82424';
    const sideGrad = side === 'BUY' ? 'linear-gradient(180deg,#3A7CC0 0%,#1F5A95 100%)' : 'linear-gradient(180deg,#E84A4A 0%,#C92F2F 100%)';
    return /*#__PURE__*/React.createElement("div", {
      onClick: () => setConfirmOpen(false),
      style: {
        position: 'absolute',
        inset: 0,
        background: 'rgba(10,14,26,0.55)',
        zIndex: 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }
    }, /*#__PURE__*/React.createElement("div", {
      onClick: e => e.stopPropagation(),
      style: {
        background: 'var(--surface)',
        borderRadius: 4,
        padding: 0,
        width: '100%',
        maxWidth: 320,
        animation: 'popIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        border: '1px solid var(--line-2)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: sideCol,
        color: '#fff',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: '1px solid ' + sideColDarker
      }
    }, /*#__PURE__*/React.createElement(Mi, {
      name: side === 'BUY' ? 'arrow_upward' : 'arrow_downward',
      size: 16,
      weight: 700
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: 0.5,
        flex: 1
      }
    }, side === 'BUY' ? 'BUY' : 'SELL', " ORDER \xB7 ", s.sym), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 6px',
        background: 'rgba(255,255,255,0.18)',
        borderRadius: 2,
        letterSpacing: 0.4
      }
    }, otype)), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '14px 16px 16px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: 'var(--text-3)',
        marginBottom: 10,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: 'uppercase'
      }
    }, "Order details"), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--bg)',
        borderRadius: 3,
        padding: '8px 12px',
        marginBottom: 14,
        border: '1px solid var(--line-2)'
      }
    }, /*#__PURE__*/React.createElement(SumRow, {
      label: "Volume",
      val: `${ALPEXA_MARKET.fmtVol(s.cls, vol)} ${ALPEXA_MARKET.getUnitLabel(s.cls)}`
    }), /*#__PURE__*/React.createElement(SumRow, {
      label: "Entry price",
      val: ALPEXA_MARKET.fmt(entryPx, s.digits)
    }), /*#__PURE__*/React.createElement(SumRow, {
      label: "Stop Loss",
      val: sl || '—'
    }), /*#__PURE__*/React.createElement(SumRow, {
      label: "Take Profit",
      val: tp || '—'
    }), /*#__PURE__*/React.createElement(SumRow, {
      label: "Required margin",
      val: `$${margin.toLocaleString('en-US', {
        maximumFractionDigits: 2
      })}`
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setConfirmOpen(false),
      style: {
        flex: 1,
        padding: '11px 0',
        borderRadius: 3,
        background: 'var(--bg-2)',
        fontSize: 12.5,
        fontWeight: 600,
        color: 'var(--text-2)',
        border: '1px solid var(--line-2)'
      }
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      onClick: place,
      style: {
        flex: 1.4,
        padding: '11px 0',
        borderRadius: 3,
        background: sideGrad,
        fontSize: 12.5,
        fontWeight: 800,
        color: '#fff',
        letterSpacing: 0.5,
        border: '1px solid ' + sideColDarker,
        boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset,0 2px 4px rgba(0,0,0,0.15)',
        textShadow: '0 1px 1px rgba(0,0,0,0.15)'
      }
    }, "Confirm ", side)))));
  })(), /*#__PURE__*/React.createElement("style", null, `@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@keyframes popIn{from{transform:scale(0.9);opacity:0}to{transform:scale(1);opacity:1}}`));
}

// ── ModifySheet ──
function ModifySheet({
  position,
  isPending = false,
  market = [],
  onSave,
  onClose
}) {
  const symInfo = ALPEXA_MARKET.SYMBOLS.find(s => s.sym === position.sym);
  const digits = symInfo ? symInfo.digits : 5;
  const [sl, setSl] = useState(position.sl ? String(position.sl) : '');
  const [tp, setTp] = useState(position.tp ? String(position.tp) : '');
  const [trigger, setTrigger] = useState(position.trigger ? String(position.trigger) : '');
  const [, force] = useState(0);
  const liveSym = market.find(m => m.sym === position.sym);
  const bid = liveSym ? ALPEXA_MARKET.fxBidPx(liveSym) : position.open; // dealt quotes (display lockstep)
  const ask = liveSym ? ALPEXA_MARKET.fxAskPx(liveSym) : position.open;
  const curPx = position.side === 'BUY' ? bid : ask;
  const lotSize = ALPEXA_MARKET.getLotSize ? ALPEXA_MARKET.getLotSize(symInfo || {
    sym: position.sym,
    cls: 'FX'
  }) : symInfo?.cls === 'FX' ? 100000 : 1;
  const tickSize = Math.pow(10, -digits);
  // USD value of one point via the corrected P&L (handles cross pairs like EURJPY).
  const tickValueUSD = symInfo ? Math.abs(ALPEXA_MARKET.getPnlUSD(symInfo, curPx, curPx + tickSize, 'BUY', position.vol || 0)) : tickSize * lotSize * (position.vol || 0);
  const entryPx = isPending ? parseFloat(trigger) || position.trigger || curPx : position.open;
  function sltpHelper(val, isTp) {
    if (val === '' || val == null) return null;
    const rawStr = String(val).trim();
    let p = parseFloat(rawStr);
    if (isNaN(p) || p === 0) return null;
    p = Math.abs(p);
    let targetPx;
    const hasDecimal = rawStr.includes('.');
    const isPipMode = !hasDecimal || p < entryPx * 0.5;
    if (isPipMode) {
      const offset = p * tickSize;
      if (isTp) targetPx = position.side === 'BUY' ? entryPx + offset : entryPx - offset;else targetPx = position.side === 'BUY' ? entryPx - offset : entryPx + offset;
    } else targetPx = p;
    const dist = Math.abs(entryPx - targetPx) * Math.pow(10, digits);
    const amt = tickValueUSD * dist;
    const pctAway = Math.abs(entryPx - targetPx) / entryPx;
    return {
      dist: dist.toFixed(0),
      amt: amt.toFixed(2),
      invalid: pctAway > 0.30,
      tooClose: dist < 10,
      pctAway: (pctAway * 100).toFixed(1),
      targetPx: targetPx.toFixed(digits),
      asPipsInput: isPipMode
    };
  }
  const slH = sltpHelper(sl, false);
  const tpH = sltpHelper(tp, true);
  useEffect(() => {
    const id = setInterval(() => force(x => x + 1), 700);
    return () => clearInterval(id);
  }, []);
  function save() {
    if (slH && (slH.invalid || slH.tooClose)) return;
    if (tpH && (tpH.invalid || tpH.tooClose)) return;
    const updated = {
      ...position,
      sl: slH ? parseFloat(slH.targetPx) : 0,
      tp: tpH ? parseFloat(tpH.targetPx) : 0
    };
    if (isPending && trigger) updated.trigger = parseFloat(trigger);
    onSave(updated);
    onClose();
  }
  const canSave = (!slH || !slH.invalid && !slH.tooClose) && (!tpH || !tpH.invalid && !tpH.tooClose);
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-sheet-overlay",
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(10,14,26,0.55)',
      zIndex: 300,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: 'var(--surface)',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      display: 'flex',
      flexDirection: 'column',
      animation: 'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      padding: '8px 0 4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 4,
      borderRadius: 2,
      background: 'var(--line-2)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 16px 6px',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, "Modify ", isPending ? 'Pending Order' : 'Position'), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-3)',
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, position.side, " ", ALPEXA_MARKET.fmtVol(symInfo?.cls || 'FX', position.vol), " ", ALPEXA_MARKET.getUnitLabel(symInfo?.cls || 'FX'), " ", position.sym))), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 28,
      height: 28,
      borderRadius: 14,
      background: 'var(--bg-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-2)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "close",
    size: 14
  }))), liveSym && /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 16px 14px',
      padding: '10px 14px',
      background: 'var(--bg)',
      borderRadius: 9,
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "livedot"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontWeight: 800,
      color: 'var(--text-3)',
      letterSpacing: 0.5
    }
  }, "LIVE")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5
    }
  }, "BID"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#E04141'
    }
  }, bid.toFixed(digits))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5
    }
  }, "ASK"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#2E6FB0'
    }
  }, ask.toFixed(digits)))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px 14px'
    }
  }, isPending && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--acc-2)',
      letterSpacing: 0.5,
      marginBottom: 5,
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "bolt",
    size: 12
  }), " TRIGGER PRICE"), /*#__PURE__*/React.createElement("input", {
    value: trigger,
    onChange: e => setTrigger(e.target.value),
    type: "number",
    step: "any",
    className: "mono",
    placeholder: Number(position.trigger || 0).toFixed(digits),
    style: {
      width: '100%',
      borderBottom: '1.5px solid var(--acc)',
      padding: '6px 0',
      fontSize: 16,
      color: 'var(--ink)',
      fontWeight: 600,
      outline: 'none',
      background: 'transparent'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 800,
      color: 'var(--sell)',
      letterSpacing: 0.5,
      marginBottom: 5,
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "shield",
    size: 12
  }), " STOP LOSS"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      borderBottom: '1.5px solid var(--line-2)',
      paddingBottom: 5
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: sl,
    onChange: e => setSl(e.target.value),
    type: "number",
    step: "any",
    placeholder: "\u2014",
    className: "mono",
    style: {
      flex: 1,
      fontSize: 15,
      color: 'var(--ink)',
      fontWeight: 600,
      outline: 'none',
      width: '100%',
      background: 'transparent'
    }
  }), sl && /*#__PURE__*/React.createElement("button", {
    onClick: () => setSl(''),
    style: {
      color: 'var(--text-3)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "close",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 9.5,
      marginTop: 5,
      color: slH ? slH.invalid || slH.tooClose ? 'var(--warn)' : 'var(--sell)' : 'var(--text-3)'
    }
  }, slH ? slH.invalid ? `⚠ ${slH.pctAway}% off entry` : slH.tooClose ? `⚠ Min 10pt (${slH.dist}pt now)` : `${slH.asPipsInput ? '→ ' + slH.targetPx + ' · ' : ''}${slH.dist} pt · −$${slH.amt}` : 'No SL set')), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 800,
      color: 'var(--buy)',
      letterSpacing: 0.5,
      marginBottom: 5,
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "flag",
    size: 12
  }), " TAKE PROFIT"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      borderBottom: '1.5px solid var(--line-2)',
      paddingBottom: 5
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: tp,
    onChange: e => setTp(e.target.value),
    type: "number",
    step: "any",
    placeholder: "\u2014",
    className: "mono",
    style: {
      flex: 1,
      fontSize: 15,
      color: 'var(--ink)',
      fontWeight: 600,
      outline: 'none',
      width: '100%',
      background: 'transparent'
    }
  }), tp && /*#__PURE__*/React.createElement("button", {
    onClick: () => setTp(''),
    style: {
      color: 'var(--text-3)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "close",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 9.5,
      marginTop: 5,
      color: tpH ? tpH.invalid || tpH.tooClose ? 'var(--warn)' : 'var(--buy)' : 'var(--text-3)'
    }
  }, tpH ? tpH.invalid ? `⚠ ${tpH.pctAway}% off entry` : tpH.tooClose ? `⚠ Min 10pt (${tpH.dist}pt now)` : `${tpH.asPipsInput ? '→ ' + tpH.targetPx + ' · ' : ''}${tpH.dist} pt · +$${tpH.amt}` : 'No TP set')))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 16px 16px',
      background: 'var(--surface)',
      borderTop: '1px solid var(--line)',
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      flex: 1,
      padding: '12px 0',
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 600,
      background: 'var(--bg-2)',
      color: 'var(--text-2)'
    }
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    onClick: save,
    disabled: !canSave,
    style: {
      flex: 1.5,
      padding: '12px 0',
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 700,
      color: '#fff',
      background: canSave ? 'var(--acc)' : 'var(--muted)',
      cursor: canSave ? 'pointer' : 'not-allowed'
    }
  }, "Save Changes"))));
}

// ── PosCard ──
function PosCard({
  p,
  onClose,
  onModify
}) {
  const up = p.pnl >= 0;
  const fresh = p.fresh;
  const symInfo = ALPEXA_MARKET.SYMBOLS.find(s => s.sym === p.sym);
  const digits = symInfo ? symInfo.digits : 5;
  const cls = symInfo ? symInfo.cls : 'FX';
  const fmtPx = v => typeof v === 'number' ? v.toFixed(digits) : v;
  const curPx = typeof p.current === 'number' ? p.current : p.open;
  const curColor = curPx > p.open ? '#2E6FB0' : curPx < p.open ? '#E04141' : 'var(--ink)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      marginBottom: 6,
      padding: '12px 14px',
      position: 'relative',
      animation: fresh ? 'newOrder 1.5s ease' : 'none',
      borderLeft: fresh ? '3px solid ' + (p.side === 'BUY' ? '#2E6FB0' : '#E04141') : '3px solid transparent'
    }
  }, fresh && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 8,
      right: 10,
      fontSize: 8.5,
      fontWeight: 800,
      padding: '2px 6px',
      borderRadius: 3,
      background: '#1B3955',
      color: '#fff',
      letterSpacing: 0.5,
      animation: 'pulse 1.2s ease infinite'
    }
  }, "NEW"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontWeight: 800,
      padding: '2px 6px',
      borderRadius: 3,
      background: p.side === 'BUY' ? 'rgba(46,111,176,0.16)' : 'rgba(224,65,65,0.16)',
      color: p.side === 'BUY' ? '#2E6FB0' : '#E04141'
    }
  }, p.side), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, p.sym), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 11,
      color: 'var(--text-3)'
    }
  }, ALPEXA_MARKET.fmtVol(cls, p.vol), " ", ALPEXA_MARKET.getUnitLabel(cls)), p.placedAt && /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 9.5,
      color: 'var(--text-3)',
      marginLeft: 'auto',
      marginRight: 8
    }
  }, p.placedAt), !p.placedAt && /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: up ? '#2E6FB0' : '#E04141'
    }
  }, up ? '+' : '', "$", p.pnl.toFixed(2))), (p.ticket || p.placedTs) && /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 9,
      color: 'var(--text-3)',
      marginBottom: 8
    }
  }, p.ticket || '', p.ticket && p.placedTs ? ' · ' : '', p.placedTs ? new Date(p.placedTs).toLocaleString() : ''), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
      background: 'var(--bg)',
      borderRadius: 3,
      padding: '6px 0',
      marginBottom: 9,
      border: '1px solid var(--line-2)'
    }
  }, /*#__PURE__*/React.createElement(Meta, {
    lbl: "OPEN",
    val: fmtPx(p.open)
  }), /*#__PURE__*/React.createElement(Meta, {
    lbl: "CUR",
    val: fmtPx(curPx),
    color: curColor
  }), /*#__PURE__*/React.createElement(Meta, {
    lbl: "SL",
    val: p.sl ? fmtPx(p.sl) : '—'
  }), /*#__PURE__*/React.createElement(Meta, {
    lbl: "TP",
    val: p.tp ? fmtPx(p.tp) : '—'
  }), /*#__PURE__*/React.createElement(Meta, {
    lbl: "SWAP",
    val: p.swap !== undefined ? (p.swap >= 0 ? '+' : '') + p.swap.toFixed(2) : '0.00'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onModify && onModify(p),
    style: {
      flex: 1,
      padding: '7px 0',
      borderRadius: 3,
      fontSize: 11.5,
      fontWeight: 600,
      background: 'var(--bg-2)',
      color: 'var(--text-2)',
      border: '1px solid var(--line-2)'
    }
  }, "Modify"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (onClose && p.id) onClose(p.id);
    },
    style: {
      flex: 1,
      padding: '7px 0',
      borderRadius: 3,
      fontSize: 11.5,
      fontWeight: 700,
      background: '#1B3955',
      color: '#fff',
      border: '1px solid #0F2742'
    }
  }, "Close")), /*#__PURE__*/React.createElement("style", null, `@keyframes newOrder{0%{background:rgba(34,184,207,0.2)}100%{background:var(--surface)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`));
}

// ── Positions ──
function filterByDate(history, mode, customFrom, customTo) {
  if (mode === 'all') return history;
  const now = new Date();
  const _p = n => String(n).padStart(2, '0');
  const _ymd = d => d.getFullYear() + '-' + _p(d.getMonth() + 1) + '-' + _p(d.getDate());
  const today = _ymd(now);
  function toIso(d) {
    if (!d) return null;
    const md = d.slice(0, 5);
    return now.getFullYear() + '-' + md;
  }
  return history.filter(h => {
    const iso = toIso(h.date);
    if (!iso) return false;
    if (mode === 'today') return iso === today;
    if (mode === '7d' || mode === '30d') {
      const days = mode === '7d' ? 7 : 30;
      const cutoff = _ymd(new Date(now.getTime() - days * 86400000));
      return iso >= cutoff && iso <= today;
    }
    if (mode === 'custom') {
      if (!customFrom && !customTo) return true;
      if (customFrom && iso < customFrom) return false;
      if (customTo && iso > customTo) return false;
      return true;
    }
    return true;
  });
}
function Positions({
  tab,
  setTab,
  liveOrders = [],
  pendingOrders = [],
  closedHistory = [],
  market = [],
  onClose,
  onCancelPending,
  onModify,
  onModifyPending
}) {
  const allPositions = [...liveOrders];
  const allHistory = [...closedHistory];
  const totalPnl = allPositions.reduce((s, p) => s + (p.pnl || 0), 0);
  const totalMargin = allPositions.reduce((sum, p) => {
    const symInfo = ALPEXA_MARKET.SYMBOLS.find(s => s.sym === p.sym);
    if (!symInfo) return sum;
    const lev = getLeverageSettings()[symInfo.cls] || 100;
    return sum + ALPEXA_MARKET.getMarginUSD(symInfo, p.vol || 0, p.open || 0, lev);
  }, 0);
  const [dateFilter, setDateFilter] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [openGroup, setOpenGroup] = useState('time');
  const [fundFilter, setFundFilter] = useState('all');
  const [, forceFund] = useState(0);
  useEffect(() => {
    const h = () => forceFund(x => x + 1);
    window.addEventListener('alpexa-funding-change', h);
    return () => window.removeEventListener('alpexa-funding-change', h);
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      background: 'var(--bg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      padding: '0 14px'
    }
  }, [['OPEN', `Open${allPositions.length ? ` (${allPositions.length})` : ''}`], ['PEND', `Pending${pendingOrders.length ? ` (${pendingOrders.length})` : ''}`], ['HIST', 'History'], ['FUND', 'Funding']].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setTab(k),
    style: {
      padding: '12px 0',
      marginRight: 18,
      fontSize: 13,
      fontWeight: tab === k ? 700 : 500,
      color: tab === k ? '#1B3955' : 'var(--text-3)',
      borderBottom: tab === k ? '2px solid #1B3955' : '2px solid transparent'
    }
  }, l))), tab === 'OPEN' && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto'
    }
  }, liveOrders.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '8px 14px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5
    }
  }, "GROUP BY"), [['time', 'Time'], ['class', 'Class'], ['symbol', 'Symbol']].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setOpenGroup(k),
    style: {
      padding: '5px 10px',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 600,
      background: openGroup === k ? 'var(--ink)' : 'var(--bg-2)',
      color: openGroup === k ? 'var(--ink-fg)' : 'var(--text-2)'
    }
  }, l)), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (window.confirm('Close all ' + liveOrders.length + ' open positions? This settles each at the current price.')) {
        liveOrders.slice().forEach(function (o) {
          try {
            onClose && onClose(o.id);
          } catch (e) {}
        });
      }
    },
    style: {
      padding: '5px 11px',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 700,
      background: 'rgba(224,65,65,0.12)',
      color: '#E04141',
      border: '1px solid rgba(224,65,65,0.45)',
      letterSpacing: 0.2
    }
  }, "Close all")), openGroup === 'time' && /*#__PURE__*/React.createElement(React.Fragment, null, liveOrders.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 14px 4px',
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--acc-2)',
      letterSpacing: 0.6,
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "livedot"
  }), " LIVE \u2014 ", liveOrders.length, " ACTIVE"), allPositions.map((p, i) => /*#__PURE__*/React.createElement(PosCard, {
    key: p.id || 'static-' + i,
    p: p,
    onClose: onClose,
    onModify: onModify
  }))), (openGroup === 'class' || openGroup === 'symbol') && (() => {
    const groups = {};
    const labels = {
      FX: 'Forex',
      STOCK: 'Stocks',
      CRYPTO: 'Crypto',
      INDEX: 'Indices'
    };
    allPositions.forEach(p => {
      const symInfo = ALPEXA_MARKET.SYMBOLS.find(s => s.sym === p.sym);
      const key = openGroup === 'class' ? symInfo ? symInfo.cls : 'OTHER' : p.sym;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return Object.keys(groups).sort().map(k => {
      const list = groups[k];
      const groupPnl = list.reduce((s, p) => s + (p.pnl || 0), 0);
      return /*#__PURE__*/React.createElement("div", {
        key: k
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          padding: '10px 14px 6px',
          fontSize: 9.5,
          fontWeight: 800,
          color: 'var(--text-3)',
          letterSpacing: 0.6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg)',
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)'
        }
      }, /*#__PURE__*/React.createElement("span", null, (labels[k] || k).toUpperCase()), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 9,
          fontWeight: 700,
          padding: '1px 6px',
          borderRadius: 9,
          background: 'var(--surface)',
          color: 'var(--text-2)',
          fontFamily: 'JetBrains Mono,monospace'
        }
      }, list.length), /*#__PURE__*/React.createElement("span", {
        style: {
          flex: 1
        }
      }), /*#__PURE__*/React.createElement("span", {
        className: "mono",
        style: {
          fontSize: 11,
          fontWeight: 700,
          color: groupPnl >= 0 ? 'var(--buy)' : 'var(--sell)'
        }
      }, groupPnl >= 0 ? '+' : '', "$", groupPnl.toFixed(2))), list.map((p, i) => /*#__PURE__*/React.createElement(PosCard, {
        key: p.id || 'g-' + k + '-' + i,
        p: p,
        onClose: onClose,
        onModify: onModify
      })));
    });
  })()), tab === 'HIST' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 5,
      padding: '10px 14px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      overflowX: 'auto'
    }
  }, [['all', 'All'], ['today', 'Today'], ['7d', '7d'], ['30d', '30d'], ['custom', 'Custom']].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setDateFilter(k),
    style: {
      flexShrink: 0,
      padding: '5px 12px',
      borderRadius: 14,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.3,
      background: dateFilter === k ? 'var(--ink)' : 'var(--bg-2)',
      color: dateFilter === k ? 'var(--ink-fg)' : 'var(--text-2)'
    }
  }, l))), dateFilter === 'custom' && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      padding: '8px 14px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: customFrom,
    onChange: e => setCustomFrom(e.target.value),
    className: "mono",
    style: {
      flex: 1,
      padding: '7px 10px',
      borderRadius: 7,
      border: '1px solid var(--line-2)',
      fontSize: 12,
      color: 'var(--ink)'
    }
  }), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: customTo,
    onChange: e => setCustomTo(e.target.value),
    className: "mono",
    style: {
      flex: 1,
      padding: '7px 10px',
      borderRadius: 7,
      border: '1px solid var(--line-2)',
      fontSize: 12,
      color: 'var(--ink)'
    }
  })), (() => {
    const filtered = filterByDate(allHistory, dateFilter, customFrom, customTo);
    const filteredPnl = filtered.reduce((s, h) => s + (h.pnl || 0), 0);
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--line)'
      }
    }, /*#__PURE__*/React.createElement(Mi, {
      name: "receipt_long",
      size: 16,
      style: {
        color: 'var(--text-3)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11.5,
        color: 'var(--text-2)',
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("b", {
      className: "mono",
      style: {
        color: 'var(--ink)'
      }
    }, filtered.length), " trades \xB7 Total ", /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: filteredPnl >= 0 ? 'var(--buy)' : 'var(--sell)',
        fontWeight: 700
      }
    }, (filteredPnl >= 0 ? '+' : '') + '$' + filteredPnl.toFixed(2)))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'var(--surface)'
      }
    }, filtered.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '40px 24px',
        textAlign: 'center',
        color: 'var(--text-3)'
      }
    }, /*#__PURE__*/React.createElement(Mi, {
      name: "history",
      size: 36,
      style: {
        color: 'var(--muted)',
        display: 'block',
        margin: '0 auto 8px'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--text-2)'
      }
    }, allHistory.length === 0 ? 'No closed trades yet' : 'No trades in this date range')), (() => {
      const grouped = {};
      filtered.forEach(h => {
        const dayKey = (h.date || '').slice(0, 5) || '—';
        if (!grouped[dayKey]) grouped[dayKey] = [];
        grouped[dayKey].push(h);
      });
      return Object.entries(grouped).map(([day, items]) => {
        const dayPnl = items.reduce((s, h) => s + (h.pnl || 0), 0);
        return /*#__PURE__*/React.createElement("div", {
          key: day
        }, /*#__PURE__*/React.createElement("div", {
          style: {
            display: 'flex',
            alignItems: 'center',
            padding: '8px 14px',
            background: 'var(--bg)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-3)',
            letterSpacing: 0.5
          }
        }, /*#__PURE__*/React.createElement("span", {
          style: {
            flex: 1
          }
        }, day), /*#__PURE__*/React.createElement("span", {
          className: "mono",
          style: {
            color: dayPnl >= 0 ? 'var(--buy)' : 'var(--sell)',
            fontWeight: 700
          }
        }, (dayPnl >= 0 ? '+' : '') + '$' + dayPnl.toFixed(2), " \xB7 ", items.length, " ", items.length === 1 ? 'trade' : 'trades')), items.map((h, i) => /*#__PURE__*/React.createElement("div", {
          key: h.id || day + '-' + i,
          style: {
            display: 'flex',
            alignItems: 'center',
            padding: '12px 14px',
            borderBottom: '1px solid var(--line)'
          }
        }, /*#__PURE__*/React.createElement("div", {
          style: {
            flex: 1.4
          }
        }, /*#__PURE__*/React.createElement("div", {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }
        }, /*#__PURE__*/React.createElement("span", {
          style: {
            fontSize: 9,
            fontWeight: 800,
            padding: '2px 5px',
            borderRadius: 3,
            background: h.side === 'BUY' ? 'var(--buy-tint)' : 'var(--sell-tint)',
            color: h.side === 'BUY' ? 'var(--buy-2)' : 'var(--sell-2)'
          }
        }, h.side), /*#__PURE__*/React.createElement("span", {
          style: {
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--ink)'
          }
        }, h.sym), /*#__PURE__*/React.createElement("span", {
          className: "mono",
          style: {
            fontSize: 10.5,
            color: 'var(--text-3)'
          }
        }, h.vol)), /*#__PURE__*/React.createElement("div", {
          className: "mono",
          style: {
            fontSize: 10,
            color: 'var(--text-3)',
            marginTop: 3
          }
        }, typeof h.open === 'number' ? h.open.toFixed(5) : h.open, " \u2192 ", typeof h.close === 'number' ? h.close.toFixed(5) : h.close, " \xB7 ", (h.date || '').slice(6))), /*#__PURE__*/React.createElement("div", {
          className: "mono",
          style: {
            fontSize: 13.5,
            fontWeight: 700,
            color: h.pnl >= 0 ? 'var(--buy)' : 'var(--sell)'
          }
        }, h.pnl >= 0 ? '+' : '', "$", h.pnl.toFixed(2)))));
      });
    })()));
  })()), tab === 'PEND' && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto'
    }
  }, pendingOrders.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 24px',
      textAlign: 'center',
      color: 'var(--text-3)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "hourglass_empty",
    size: 36,
    style: {
      color: 'var(--muted)',
      display: 'block',
      margin: '0 auto 8px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--text-2)'
    }
  }, "No pending orders"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      marginTop: 4
    }
  }, "Limit / Stop orders will appear here")), pendingOrders.map(p => {
    const isBuy = p.side === 'BUY';
    const symInfo = ALPEXA_MARKET.SYMBOLS.find(s => s.sym === p.sym);
    const liveSym = market.find(m => m.sym === p.sym);
    const digits = symInfo ? symInfo.digits : 5;
    const curPx = liveSym ? isBuy ? ALPEXA_MARKET.fxAskPx(liveSym) : ALPEXA_MARKET.fxBidPx(liveSym) : 0; // dealt quotes (display lockstep)
    const dist = curPx ? (p.trigger - curPx) * Math.pow(10, digits) : 0;
    return /*#__PURE__*/React.createElement("div", {
      key: p.id,
      style: {
        background: 'var(--surface)',
        marginBottom: 6,
        padding: '12px 14px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 9
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        fontWeight: 800,
        padding: '2px 6px',
        borderRadius: 3,
        letterSpacing: 0.3,
        background: isBuy ? 'var(--buy-tint)' : 'var(--sell-tint)',
        color: isBuy ? 'var(--buy-2)' : 'var(--sell-2)'
      }
    }, p.side, " ", p.otype), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        fontWeight: 700,
        color: 'var(--ink)'
      }
    }, p.sym), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 11,
        color: 'var(--text-3)'
      }
    }, ALPEXA_MARKET.fmtVol(symInfo?.cls || 'FX', p.vol), " ", ALPEXA_MARKET.getUnitLabel(symInfo?.cls || 'FX')), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        fontWeight: 700,
        padding: '2px 5px',
        borderRadius: 3,
        background: 'rgba(229,139,30,0.18)',
        color: 'var(--warn)',
        letterSpacing: 0.4,
        display: 'flex',
        alignItems: 'center',
        gap: 3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: 'var(--warn)',
        display: 'inline-block'
      }
    }), "WAITING")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: '1.2fr 1fr 1fr 0.9fr',
        background: 'var(--bg)',
        borderRadius: 8,
        padding: '6px 0',
        marginBottom: 9
      }
    }, /*#__PURE__*/React.createElement(Meta, {
      lbl: p.otype + ' @',
      val: p.trigger.toFixed(digits)
    }), /*#__PURE__*/React.createElement(Meta, {
      lbl: "SL",
      val: p.sl ? p.sl.toFixed(digits) : '—'
    }), /*#__PURE__*/React.createElement(Meta, {
      lbl: "TP",
      val: p.tp ? p.tp.toFixed(digits) : '—'
    }), /*#__PURE__*/React.createElement(Meta, {
      lbl: "DIST",
      val: (dist >= 0 ? '+' : '') + dist.toFixed(0) + 'pt'
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => onModifyPending && onModifyPending(p),
      style: {
        flex: 1,
        padding: '7px 0',
        borderRadius: 7,
        fontSize: 11.5,
        fontWeight: 600,
        background: 'var(--bg-2)',
        color: 'var(--text-2)'
      }
    }, "Modify"), /*#__PURE__*/React.createElement("button", {
      onClick: () => onCancelPending && onCancelPending(p.id),
      style: {
        flex: 1,
        padding: '7px 0',
        borderRadius: 7,
        fontSize: 11.5,
        fontWeight: 700,
        background: 'var(--sell-tint)',
        color: 'var(--sell-2)'
      }
    }, "Cancel")));
  })), tab === 'FUND' && (() => {
    const all = getFundingHistory();
    const list = fundFilter === 'all' ? all : all.filter(r => r.kind === fundFilter);
    const totalIn = all.filter(r => r.kind === 'deposit').reduce((s, r) => s + (r.amount || 0), 0);
    const totalOut = all.filter(r => r.kind === 'withdraw').reduce((s, r) => s + (r.amount || 0), 0);
    const net = totalIn - totalOut;
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        padding: '12px 14px',
        gap: 14,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--line)'
      }
    }, /*#__PURE__*/React.createElement(Stat, {
      label: "Net Funded",
      val: `${net >= 0 ? '+' : '-'}$${Math.abs(net).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`,
      color: net >= 0 ? '#2E6FB0' : '#E04141'
    }), /*#__PURE__*/React.createElement(Stat, {
      label: "Deposits",
      val: `$${totalIn.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })}`
    }), /*#__PURE__*/React.createElement(Stat, {
      label: "Withdrawals",
      val: `$${totalOut.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })}`
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 5,
        padding: '10px 14px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--line)',
        overflowX: 'auto'
      }
    }, [['all', 'All'], ['deposit', 'Deposits'], ['withdraw', 'Withdrawals'], ['transfer', 'Transfers']].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
      key: k,
      onClick: () => setFundFilter(k),
      style: {
        flexShrink: 0,
        padding: '5px 12px',
        borderRadius: 14,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.3,
        background: fundFilter === k ? 'var(--ink)' : 'var(--bg-2)',
        color: fundFilter === k ? 'var(--ink-fg)' : 'var(--text-2)'
      }
    }, l))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--line)'
      }
    }, /*#__PURE__*/React.createElement(Mi, {
      name: "receipt_long",
      size: 16,
      style: {
        color: 'var(--text-3)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11.5,
        color: 'var(--text-2)',
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("b", {
      className: "mono",
      style: {
        color: 'var(--ink)'
      }
    }, list.length), " ", list.length === 1 ? 'transaction' : 'transactions')), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'var(--surface)'
      }
    }, list.length === 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '40px 24px',
        textAlign: 'center',
        color: 'var(--text-3)'
      }
    }, /*#__PURE__*/React.createElement(Mi, {
      name: "receipt_long",
      size: 36,
      style: {
        color: 'var(--muted)',
        display: 'block',
        margin: '0 auto 8px'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--text-2)'
      }
    }, "No transactions yet"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        marginTop: 4
      }
    }, "Deposits, withdrawals and transfers will appear here")) : list.map(rec => /*#__PURE__*/React.createElement(FundingRow, {
      key: rec.id,
      rec: rec
    }))));
  })());
}

// ── NewsScreen ──
function NewsScreen() {
  const [tab, setTab] = useState('NEWS');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      background: 'var(--bg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      padding: '0 14px'
    }
  }, [['NEWS', 'News'], ['CAL', 'Calendar']].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setTab(k),
    style: {
      padding: '12px 0',
      marginRight: 18,
      fontSize: 13,
      fontWeight: tab === k ? 700 : 500,
      color: tab === k ? 'var(--ink)' : 'var(--text-3)',
      borderBottom: tab === k ? '2px solid var(--ink)' : '2px solid transparent'
    }
  }, l))), tab === 'NEWS' && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto'
    }
  }, ALPEXA_MARKET.NEWS.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 20px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 13
    }
  }, "No market news right now."), ALPEXA_MARKET.NEWS.map((n, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: 'var(--surface)',
      padding: '12px 14px',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 11,
      color: 'var(--text-3)'
    }
  }, n.t), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontWeight: 800,
      padding: '2px 5px',
      borderRadius: 3,
      background: 'var(--bg-2)',
      color: 'var(--text-2)',
      letterSpacing: 0.4
    }
  }, n.tag), n.impact === 'high' && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontWeight: 800,
      padding: '2px 5px',
      borderRadius: 3,
      background: 'var(--sell-tint)',
      color: 'var(--sell-2)'
    }
  }, "HIGH")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      fontWeight: 700,
      color: 'var(--ink)',
      lineHeight: 1.35,
      marginBottom: 3
    }
  }, n.ttl), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-2)',
      lineHeight: 1.45
    }
  }, n.body)))), tab === 'CAL' && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      overflowX: 'hidden',
      background: 'var(--surface)'
    }
  }, ALPEXA_MARKET.CALENDAR.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 20px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 13
    }
  }, "No scheduled events."), ALPEXA_MARKET.CALENDAR.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      padding: '12px 14px',
      borderBottom: '1px solid var(--line)',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: 'var(--ink)',
      width: 42
    }
  }, c.time), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      fontWeight: 800,
      padding: '2px 5px',
      borderRadius: 3,
      background: 'var(--bg-2)',
      color: 'var(--text-2)'
    }
  }, c.ccy), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 12,
      color: 'var(--ink)'
    }
  }, c.ttl), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 1
    }
  }, [1, 2, 3].map(n => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      width: 6,
      height: 6,
      borderRadius: 1.5,
      background: n <= c.impact ? c.impact === 3 ? 'var(--sell)' : c.impact === 2 ? 'var(--warn)' : 'var(--buy)' : 'var(--line-2)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 10.5,
      color: 'var(--text-3)',
      width: 50,
      textAlign: 'right'
    }
  }, c.fcst)))));
}

// ── Account helper components ──
// ── Managed Funds (PAMM) — 투자자 화면 (2026-08-06). 단일 소스 = pamm_investor_report RPC.
//    참여/회수는 서버 RPC(pamm_join/pamm_leave, pamm-* 멱등 ref)만. 성공 후 서버 진실 재적재.
function PammFunds() {
  const [rep, setRep] = useState(null);
  const [busy, setBusy] = useState('');
  const num = n => (Number(n) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const load = React.useCallback(function () {
    if (!(window.AlpexaSync && AlpexaSync.db)) {
      setRep({
        ok: false
      });
      return;
    }
    AlpexaSync.db.rpc('pamm_investor_report').then(function (r) {
      setRep(r && r.data || {
        ok: false
      });
    }, function () {
      setRep({
        ok: false
      });
    });
  }, []);
  useEffect(function () {
    load();
    var iv = setInterval(load, 15000);
    return function () {
      clearInterval(iv);
    };
  }, [load]);
  var reloadTruth = function () {
    try {
      AlpexaSync.pullBalances && AlpexaSync.pullBalances().then(function (b) {
        if (!b) return;
        try {
          var o = window.__fxSrvBal || {};
          if (b.fx != null) o.fx = b.fx;
          window.__fxSrvBal = o;
          window.dispatchEvent(new Event('alpexa-balance-change'));
        } catch (e) {}
      });
    } catch (e) {}
    load();
  };
  var act = async function (kind, f) {
    if (kind === 'join' || kind === 'add') {
      var v = +prompt('Amount to invest in ' + f.name + ' (USD)' + (f.min_join ? '\nMinimum: $' + num(f.min_join) : ''), '');
      if (!(v > 0)) return;
      setBusy(f.fund_acct);
      var r = await AlpexaSync.db.rpc('pamm_join', {
        p_ref: 'pamm-' + f.fund_acct + '-' + Date.now(),
        p_fund: f.fund_acct,
        p_usd: v
      });
      setBusy('');
      var d = r && r.data || {};
      if (!d.ok) {
        alert('Join failed: ' + (d.error || 'try again'));
        return;
      }
      reloadTruth();
      alert('Invested $' + num(v) + ' in ' + f.name + ' \u2713');
    } else if (kind === 'redeem') {
      var m = f.mine;
      if (!m) return;
      var all = confirm('Redeem your full stake in ' + f.name + '?\nCurrent value: $' + num(m.value) + '\n\nOK = redeem all \u00b7 Cancel = choose amount');
      var units = m.units;
      if (!all) {
        var vv = +prompt('Amount to redeem (USD), max $' + num(m.value), '');
        if (!(vv > 0)) return;
        units = Math.min(m.units, vv / (+f.nav || 1));
      }
      setBusy(f.fund_acct);
      var r2 = await AlpexaSync.db.rpc('pamm_leave', {
        p_ref: 'pamm-' + f.fund_acct + '-out-' + Date.now(),
        p_fund: f.fund_acct,
        p_units: units
      });
      setBusy('');
      var d2 = r2 && r2.data || {};
      if (!d2.ok) {
        alert('Redeem failed: ' + (d2.error || 'try again'));
        return;
      }
      reloadTruth();
      alert('Redeemed $' + num(d2.net || 0) + (d2.fee ? ' (perf fee $' + num(d2.fee) + ')' : '') + ' \u2192 your FX balance \u2713');
    }
  };
  if (!rep) return null;
  var funds = rep.ok && rep.funds || [];
  if (rep.ok && !funds.length) return null; // 펀드 없으면 섹션 숨김
  return /*#__PURE__*/React.createElement(Section, {
    title: "Managed Funds (PAMM)"
  }, !rep.ok ? /*#__PURE__*/React.createElement(Row, {
    label: "Sign in to view managed funds"
  }) : funds.map(function (f) {
    var m = f.mine,
      ret = +f.ret || 0,
      pnl = m ? +m.pnl || 0 : 0,
      b = busy === f.fund_acct;
    return /*#__PURE__*/React.createElement("div", {
      key: f.fund_acct,
      style: {
        padding: '11px 14px',
        borderBottom: '1px solid var(--line-2)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13.5,
        fontWeight: 700,
        color: 'var(--ink)'
      }
    }, f.name, f.is_manager ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: '#c9a227',
        fontSize: 9.5,
        marginLeft: 6
      }
    }, "MANAGER") : null), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 700,
        color: ret >= 0 ? 'var(--buy-2)' : 'var(--sell-2)'
      }
    }, (ret >= 0 ? '+' : '') + (ret * 100).toFixed(2) + '%')), m ? /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: 'var(--text-2)',
        marginTop: 3
      }
    }, "My investment ", /*#__PURE__*/React.createElement("b", {
      style: {
        color: 'var(--ink)'
      }
    }, "$", num(m.basis)), " \\u2192 now ", /*#__PURE__*/React.createElement("b", {
      style: {
        color: 'var(--ink)'
      }
    }, "$", num(m.value)), " ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: pnl >= 0 ? 'var(--buy-2)' : 'var(--sell-2)',
        fontWeight: 700
      }
    }, "(", pnl >= 0 ? '+' : '', "$", num(Math.abs(pnl)), ")")) : /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: 'var(--text-3)',
        marginTop: 3
      }
    }, "Perf. fee ", +f.perf_fee_pct || 0, "% \\u00b7 min $", num(f.min_join), f.status !== 'active' ? ' \u00b7 ' + f.status : ''), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 7,
        marginTop: 8
      }
    }, f.is_manager ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: 'var(--text-3)'
      }
    }, "You manage this fund") : b ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: 'var(--text-3)'
      }
    }, "Processing\\u2026") : /*#__PURE__*/React.createElement(React.Fragment, null, m ? /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        act('add', f);
      },
      style: {
        fontSize: 12,
        fontWeight: 700,
        padding: '6px 16px',
        borderRadius: 6,
        background: 'var(--bg-2)',
        color: 'var(--ink)',
        border: '1px solid var(--line-2)'
      }
    }, "Add") : f.status === 'active' ? /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        act('join', f);
      },
      style: {
        fontSize: 12,
        fontWeight: 700,
        padding: '6px 18px',
        borderRadius: 6,
        background: 'var(--buy-2)',
        color: '#fff',
        border: 'none'
      }
    }, "Join") : null, m ? /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        act('redeem', f);
      },
      style: {
        fontSize: 12,
        fontWeight: 700,
        padding: '6px 16px',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--sell-2)',
        border: '1px solid var(--sell-2)'
      }
    }, "Redeem") : null)));
  }));
}
function Section({
  title,
  children
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.6,
      padding: '14px 14px 6px'
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)'
    }
  }, children));
}
function Row({
  label,
  val,
  chev,
  toggle,
  mono,
  onClick,
  onToggle
}) {
  const [on, setOn] = useState(toggle);
  useEffect(() => {
    setOn(toggle);
  }, [toggle]);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      display: 'flex',
      alignItems: 'center',
      padding: '12px 14px',
      borderBottom: '1px solid var(--line)',
      cursor: onClick ? 'pointer' : 'default'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 13,
      color: 'var(--ink)'
    }
  }, label), val && /*#__PURE__*/React.createElement("span", {
    className: mono ? 'mono' : '',
    style: {
      fontSize: 12.5,
      color: 'var(--text-2)',
      marginRight: chev ? 6 : 0
    }
  }, val), chev && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, ScreenIcons.chev), toggle !== undefined && /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      const nv = !on;
      setOn(nv);
      if (onToggle) onToggle(nv);
    },
    style: {
      width: 36,
      height: 22,
      borderRadius: 11,
      position: 'relative',
      background: on ? '#1B3955' : 'var(--muted)',
      transition: 'background 0.2s'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 18,
      height: 18,
      background: '#fff',
      borderRadius: 9,
      position: 'absolute',
      top: 2,
      left: on ? 16 : 2,
      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      transition: 'left 0.2s'
    }
  })));
}
function ActionBtn({
  icon,
  label,
  primary,
  active,
  onClick
}) {
  const [hover, setHover] = useState(false);
  const on = primary || active;
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      flex: 1,
      padding: '11px 0',
      borderRadius: 10,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 3,
      background: on ? 'var(--acc)' : hover ? 'var(--acc-3)' : 'var(--surface)',
      color: on ? '#fff' : hover ? 'var(--acc-2)' : 'var(--ink)',
      boxShadow: 'var(--shadow-sm)',
      border: on ? 'none' : '1px solid ' + (hover ? 'var(--acc)' : 'var(--line-2)'),
      transition: 'background 0.15s,color 0.15s',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: icon,
    size: 18,
    weight: 500
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      fontWeight: 600
    }
  }, label));
}
function SheetLabel({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      marginBottom: 6,
      marginTop: 4
    }
  }, children);
}
function Row2({
  l,
  v,
  bold
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '4px 0',
      fontSize: 12,
      color: bold ? 'var(--ink)' : 'var(--text-2)',
      fontWeight: bold ? 700 : 500
    }
  }, /*#__PURE__*/React.createElement("span", null, l), /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, v));
}
function MethodGrid({
  value,
  onChange,
  options
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginBottom: 14
    }
  }, options.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.v,
    onClick: () => onChange(o.v),
    style: {
      flex: 1,
      minWidth: 0,
      padding: '11px 6px',
      borderRadius: 8,
      cursor: 'pointer',
      background: value === o.v ? '#0F2742' : 'var(--surface)',
      border: value === o.v ? '1.5px solid #0F2742' : '1px solid var(--line-2)',
      color: value === o.v ? '#fff' : 'var(--ink)',
      fontSize: 12.5,
      fontWeight: 700,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, o.label)));
}
function AmountField({
  amount,
  setAmount,
  quick,
  currency,
  max
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SheetLabel, null, "Amount"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      padding: '14px 14px',
      background: 'var(--bg)',
      borderRadius: 3,
      marginBottom: 8,
      border: '1px solid var(--line-2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--text-3)'
    }
  }, "$"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: amount,
    onChange: e => setAmount(e.target.value),
    placeholder: "0.00",
    className: "mono",
    style: {
      flex: 1,
      fontSize: 26,
      fontWeight: 700,
      color: 'var(--ink)',
      letterSpacing: -0.3,
      background: 'transparent',
      border: 'none',
      outline: 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--text-3)',
      fontWeight: 600,
      letterSpacing: 0.4
    }
  }, currency)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4,
      marginBottom: 14
    }
  }, quick.map(q => {
    const isSel = String(amount) === String(q === 'MAX' ? max || 0 : q);
    return /*#__PURE__*/React.createElement("button", {
      key: q,
      onClick: () => setAmount(q === 'MAX' ? String(max || 0) : String(q)),
      className: "mono",
      style: {
        flex: 1,
        padding: '7px 0',
        borderRadius: 3,
        fontSize: 11,
        fontWeight: 700,
        background: isSel ? '#1B3955' : 'var(--bg-2)',
        color: isSel ? '#fff' : 'var(--text-2)',
        border: '1px solid ' + (isSel ? '#0F2742' : 'var(--line-2)')
      }
    }, q === 'MAX' ? 'MAX' : '$' + q.toLocaleString());
  })));
}

// ── LeverageSheet ──
function LeverageSheet({
  openPositions,
  onClose
}) {
  // Brokers freeze leverage while positions are open.
  const locked = (openPositions || 0) > 0;
  const [lev, setLev] = useState(getLeverageSettings());
  const PRESETS = {
    FX: [10, 30, 50, 100, 200, 500],
    INDEX: [5, 10, 20, 50, 100],
    STOCK: [1, 2, 5, 10, 20],
    CRYPTO: [1, 2, 5, 10, 20]
  };
  const META = {
    FX: {
      label: 'Forex',
      sub: 'Major and minor currency pairs',
      icon: 'currency_exchange'
    },
    INDEX: {
      label: 'Indices',
      sub: 'NAS100, SPX500, GER40, etc.',
      icon: 'show_chart'
    },
    STOCK: {
      label: 'Stocks',
      sub: 'AAPL, TSLA, NVDA, MSFT, etc.',
      icon: 'business'
    },
    CRYPTO: {
      label: 'Crypto',
      sub: 'BTC, ETH and other crypto CFDs',
      icon: 'currency_bitcoin'
    }
  };
  function save() {
    setLeverageSettings(lev);
    window.dispatchEvent(new Event('alpexa-balance-change'));
    onClose();
  }
  function reset() {
    const d = {
      FX: 100,
      INDEX: 20,
      STOCK: 5,
      CRYPTO: 5
    };
    setLev(d);
    setLeverageSettings(d);
    window.dispatchEvent(new Event('alpexa-balance-change'));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-sheet-overlay",
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(10,14,26,0.55)',
      zIndex: 300,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: 'var(--surface)',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      display: 'flex',
      flexDirection: 'column',
      maxHeight: '88%',
      overflow: 'hidden',
      animation: 'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      padding: '8px 0 4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 4,
      borderRadius: 2,
      background: 'var(--line-2)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 16px 12px',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, "Leverage Settings"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-3)',
      marginTop: 2
    }
  }, "Adjust max leverage per asset class")), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 28,
      height: 28,
      borderRadius: 14,
      background: 'var(--bg-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-2)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "close",
    size: 14
  }))), locked && /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 16px 10px',
      background: 'var(--sell-tint)',
      borderRadius: 9,
      padding: '10px 12px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      fontSize: 11.5,
      color: 'var(--sell-2)',
      lineHeight: 1.45,
      border: '1px solid rgba(229,57,53,0.25)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "lock",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", null, "Locked."), " Close your ", openPositions, " open ", openPositions === 1 ? 'position' : 'positions', " before changing leverage.")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '0 16px 14px'
    }
  }, ['FX', 'INDEX', 'STOCK', 'CRYPTO'].map(cls => {
    const m = META[cls];
    const presets = PRESETS[cls];
    const cur = lev[cls];
    const marginPct = (100 / cur).toFixed(cur < 10 ? 0 : 1);
    return /*#__PURE__*/React.createElement("div", {
      key: cls,
      style: {
        background: 'var(--bg)',
        borderRadius: 11,
        padding: '12px 14px',
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 32,
        height: 32,
        borderRadius: 8,
        background: 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--acc-2)'
      }
    }, /*#__PURE__*/React.createElement(Mi, {
      name: m.icon,
      size: 18
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--ink)'
      }
    }, m.label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10.5,
        color: 'var(--text-3)',
        marginTop: 1
      }
    }, m.sub)), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right'
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "mono",
      style: {
        fontSize: 15,
        fontWeight: 700,
        color: 'var(--ink)'
      }
    }, "1:", cur), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9.5,
        color: 'var(--text-3)',
        marginTop: 1
      }
    }, marginPct, "% margin"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 4
      }
    }, presets.map(p => /*#__PURE__*/React.createElement("button", {
      key: p,
      onClick: () => {
        if (locked) return;
        const next = {
          ...lev,
          [cls]: p
        };
        setLev(next);
        setLeverageSettings(next);
        window.dispatchEvent(new Event('alpexa-balance-change'));
      },
      disabled: locked,
      className: "mono",
      style: {
        flex: 1,
        padding: '8px 0',
        borderRadius: 7,
        fontSize: 11,
        fontWeight: 700,
        background: cur === p ? locked ? 'var(--muted)' : '#1B3955' : 'var(--surface)',
        color: cur === p ? '#fff' : locked ? 'var(--text-3)' : 'var(--text-2)',
        border: '1px solid ' + (cur === p ? locked ? 'var(--muted)' : '#1B3955' : 'var(--line-2)'),
        opacity: locked && cur !== p ? 0.5 : 1,
        cursor: locked ? 'not-allowed' : 'pointer'
      }
    }, "1:", p))));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--acc-3)',
      borderRadius: 9,
      padding: '10px 12px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      fontSize: 11.5,
      color: 'var(--acc-2)',
      lineHeight: 1.45
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "info",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, "Higher leverage amplifies both profits and losses. ESMA/FCA regulated brokers cap retail leverage at 1:30 for FX majors, 1:20 for indices, 1:5 for stocks, and 1:2 for crypto."))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 16px 16px',
      background: 'var(--surface)',
      borderTop: '1px solid var(--line)',
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => !locked && reset(),
    disabled: locked,
    style: {
      flex: 1,
      padding: '12px 0',
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 600,
      background: 'var(--bg-2)',
      color: locked ? 'var(--muted)' : 'var(--text-2)',
      cursor: locked ? 'not-allowed' : 'pointer',
      opacity: locked ? 0.6 : 1
    }
  }, "Reset to Default"), /*#__PURE__*/React.createElement("button", {
    onClick: () => !locked && save(),
    disabled: locked,
    style: {
      flex: 1.5,
      padding: '12px 0',
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 700,
      color: '#fff',
      background: locked ? 'var(--muted)' : '#1B3955',
      cursor: locked ? 'not-allowed' : 'pointer'
    }
  }, locked ? 'Close positions first' : 'Save Changes'))));
}

// ── LanguageSheet ──
const LANGUAGES = [{
  code: 'en',
  name: 'English',
  native: 'English',
  flag: '🇬🇧'
}, {
  code: 'ko',
  name: 'Korean',
  native: '한국어',
  flag: '🇰🇷'
}, {
  code: 'ja',
  name: 'Japanese',
  native: '日本語',
  flag: '🇯🇵'
}, {
  code: 'zh',
  name: 'Chinese (Simp.)',
  native: '简体中文',
  flag: '🇨🇳'
}, {
  code: 'zh-TW',
  name: 'Chinese (Trad.)',
  native: '繁體中文',
  flag: '🇹🇼'
}, {
  code: 'es',
  name: 'Spanish',
  native: 'Español',
  flag: '🇪🇸'
}, {
  code: 'pt',
  name: 'Portuguese (BR)',
  native: 'Português',
  flag: '🇧🇷'
}, {
  code: 'fr',
  name: 'French',
  native: 'Français',
  flag: '🇫🇷'
}, {
  code: 'de',
  name: 'German',
  native: 'Deutsch',
  flag: '🇩🇪'
}, {
  code: 'it',
  name: 'Italian',
  native: 'Italiano',
  flag: '🇮🇹'
}, {
  code: 'ru',
  name: 'Russian',
  native: 'Русский',
  flag: '🇷🇺'
}, {
  code: 'ar',
  name: 'Arabic',
  native: 'العربية',
  flag: '🇸🇦'
}, {
  code: 'hi',
  name: 'Hindi',
  native: 'हिन्दी',
  flag: '🇮🇳'
}, {
  code: 'id',
  name: 'Indonesian',
  native: 'Bahasa',
  flag: '🇮🇩'
}, {
  code: 'vi',
  name: 'Vietnamese',
  native: 'Tiếng Việt',
  flag: '🇻🇳'
}, {
  code: 'th',
  name: 'Thai',
  native: 'ไทย',
  flag: '🇹🇭'
}, {
  code: 'tr',
  name: 'Turkish',
  native: 'Türkçe',
  flag: '🇹🇷'
}];
window.LANGUAGES = LANGUAGES;
window.getLanguageLabel = function (code) {
  const l = LANGUAGES.find(x => x.code === code) || LANGUAGES[0];
  return l.flag + ' ' + l.native;
};

// ── i18n (core labels). Falls back to English for untranslated strings/langs. ──
const I18N = {
  'Watch': {
    ko: '시세',
    ja: '相場',
    zh: '行情',
    'zh-TW': '行情',
    es: 'Mercado',
    pt: 'Mercado',
    fr: 'Marché',
    de: 'Markt',
    ru: 'Рынок'
  },
  'Chart': {
    ko: '차트',
    ja: 'チャート',
    zh: '图表',
    'zh-TW': '圖表',
    es: 'Gráfico',
    pt: 'Gráfico',
    fr: 'Graphique',
    de: 'Chart',
    ru: 'График'
  },
  'Trade': {
    ko: '거래',
    ja: '取引',
    zh: '交易',
    'zh-TW': '交易',
    es: 'Operar',
    pt: 'Operar',
    fr: 'Trader',
    de: 'Handel',
    ru: 'Сделка'
  },
  'History': {
    ko: '내역',
    ja: '履歴',
    zh: '历史',
    'zh-TW': '歷史',
    es: 'Historial',
    pt: 'Histórico',
    fr: 'Historique',
    de: 'Verlauf',
    ru: 'История'
  },
  'Account': {
    ko: '계정',
    ja: '口座',
    zh: '账户',
    'zh-TW': '帳戶',
    es: 'Cuenta',
    pt: 'Conta',
    fr: 'Compte',
    de: 'Konto',
    ru: 'Счёт'
  },
  'Buy': {
    ko: '매수',
    ja: '買い',
    zh: '买入',
    'zh-TW': '買入',
    es: 'Comprar',
    pt: 'Comprar',
    fr: 'Acheter',
    de: 'Kaufen',
    ru: 'Купить'
  },
  'Sell': {
    ko: '매도',
    ja: '売り',
    zh: '卖出',
    'zh-TW': '賣出',
    es: 'Vender',
    pt: 'Vender',
    fr: 'Vendre',
    de: 'Verkaufen',
    ru: 'Продать'
  },
  'Deposit': {
    ko: '입금',
    ja: '入金',
    zh: '存款',
    'zh-TW': '存款',
    es: 'Depositar',
    pt: 'Depositar',
    fr: 'Dépôt',
    de: 'Einzahlen',
    ru: 'Депозит'
  },
  'Withdraw': {
    ko: '출금',
    ja: '出金',
    zh: '提现',
    'zh-TW': '提現',
    es: 'Retirar',
    pt: 'Retirar',
    fr: 'Retrait',
    de: 'Auszahlen',
    ru: 'Вывод'
  },
  'Transfer': {
    ko: '이체',
    ja: '振替',
    zh: '转账',
    'zh-TW': '轉帳',
    es: 'Transferir',
    pt: 'Transferir',
    fr: 'Transfert',
    de: 'Übertragen',
    ru: 'Перевод'
  },
  'Favorites': {
    ko: '즐겨찾기',
    ja: 'お気に入り',
    zh: '自选',
    'zh-TW': '自選',
    es: 'Favoritos',
    pt: 'Favoritos',
    fr: 'Favoris',
    de: 'Favoriten',
    ru: 'Избранное'
  },
  'Forex': {
    ko: '외환',
    ja: '為替',
    zh: '外汇',
    'zh-TW': '外匯',
    es: 'Forex',
    pt: 'Forex',
    fr: 'Forex',
    de: 'Forex',
    ru: 'Форекс'
  },
  'Stocks': {
    ko: '주식',
    ja: '株式',
    zh: '股票',
    'zh-TW': '股票',
    es: 'Acciones',
    pt: 'Ações',
    fr: 'Actions',
    de: 'Aktien',
    ru: 'Акции'
  },
  'Crypto': {
    ko: '코인',
    ja: '暗号資産',
    zh: '加密',
    'zh-TW': '加密',
    es: 'Cripto',
    pt: 'Cripto',
    fr: 'Crypto',
    de: 'Krypto',
    ru: 'Крипто'
  },
  'Indices': {
    ko: '지수',
    ja: '指数',
    zh: '指数',
    'zh-TW': '指數',
    es: 'Índices',
    pt: 'Índices',
    fr: 'Indices',
    de: 'Indizes',
    ru: 'Индексы'
  },
  'Open': {
    ko: '진입가',
    ja: '始値',
    zh: '开仓',
    'zh-TW': '開倉',
    es: 'Apertura',
    pt: 'Abertura',
    fr: 'Ouvert',
    de: 'Eröffnung',
    ru: 'Откр.'
  },
  'Close': {
    ko: '청산',
    ja: '決済',
    zh: '平仓',
    'zh-TW': '平倉',
    es: 'Cerrar',
    pt: 'Fechar',
    fr: 'Clôturer',
    de: 'Schließen',
    ru: 'Закрыть'
  },
  'Modify': {
    ko: '수정',
    ja: '変更',
    zh: '修改',
    'zh-TW': '修改',
    es: 'Modificar',
    pt: 'Modificar',
    fr: 'Modifier',
    de: 'Ändern',
    ru: 'Изменить'
  },
  'Equity': {
    ko: '순자산',
    ja: '有効証拠金',
    zh: '净值',
    'zh-TW': '淨值',
    es: 'Patrimonio',
    pt: 'Patrimônio',
    fr: 'Capital',
    de: 'Equity',
    ru: 'Капитал'
  },
  'Balance': {
    ko: '잔고',
    ja: '残高',
    zh: '余额',
    'zh-TW': '餘額',
    es: 'Saldo',
    pt: 'Saldo',
    fr: 'Solde',
    de: 'Guthaben',
    ru: 'Баланс'
  },
  'Settings': {
    ko: '설정',
    ja: '設定',
    zh: '设置',
    'zh-TW': '設定',
    es: 'Ajustes',
    pt: 'Configurações',
    fr: 'Paramètres',
    de: 'Einstellungen',
    ru: 'Настройки'
  },
  'Language': {
    ko: '언어',
    ja: '言語',
    zh: '语言',
    'zh-TW': '語言',
    es: 'Idioma',
    pt: 'Idioma',
    fr: 'Langue',
    de: 'Sprache',
    ru: 'Язык'
  },
  'Margin': {
    ko: '증거금',
    ja: '証拠金',
    zh: '保证金',
    'zh-TW': '保證金',
    es: 'Margen',
    pt: 'Margem',
    fr: 'Marge',
    de: 'Margin',
    ru: 'Маржа'
  },
  'Free margin': {
    ko: '주문가능',
    ja: '余剰証拠金',
    zh: '可用保证金',
    'zh-TW': '可用保證金',
    es: 'Margen libre',
    pt: 'Margem livre',
    fr: 'Marge libre',
    de: 'Freie Margin',
    ru: 'Свободно'
  },
  'Margin level': {
    ko: '증거금비율',
    ja: '証拠金維持率',
    zh: '保证金水平',
    'zh-TW': '保證金水平',
    es: 'Nivel margen',
    pt: 'Nível margem',
    fr: 'Niveau marge',
    de: 'Margin-Level',
    ru: 'Уровень маржи'
  },
  'Report': {
    ko: '리포트',
    ja: 'レポート',
    zh: '报告',
    'zh-TW': '報告',
    es: 'Informe',
    pt: 'Relatório',
    fr: 'Rapport',
    de: 'Bericht',
    ru: 'Отчёт'
  },
  'Market closed': {
    ko: '시장 마감',
    ja: '市場クローズ',
    zh: '休市',
    'zh-TW': '休市',
    es: 'Mercado cerrado',
    pt: 'Mercado fechado',
    fr: 'Marché fermé',
    de: 'Markt geschlossen',
    ru: 'Рынок закрыт'
  },
  'Equity': {
    ko: '순자산',
    ja: '有効証拠金',
    zh: '净值',
    'zh-TW': '淨值',
    es: 'Patrimonio',
    pt: 'Patrimônio',
    fr: 'Capital',
    de: 'Equity',
    ru: 'Капитал'
  }
};
function tr(s) {
  try {
    const l = getPrefs().language || 'en';
    if (l === 'en') return s;
    const e = I18N[s];
    return e && e[l] || s;
  } catch (e) {
    return s;
  }
}
window.alpexaTR = tr;
function LanguageSheet({
  onClose
}) {
  const [selected, setSelected] = useState(getPrefs().language || 'en');
  const [search, setSearch] = useState('');
  function save() {
    setPref('language', selected);
    onClose();
  }
  const filtered = LANGUAGES.filter(l => !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.native.toLowerCase().includes(search.toLowerCase()) || l.code.toLowerCase().includes(search.toLowerCase()));
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-sheet-overlay",
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(10,14,26,0.55)',
      zIndex: 300,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: 'var(--surface)',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      display: 'flex',
      flexDirection: 'column',
      maxHeight: '88%',
      animation: 'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      padding: '8px 0 4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 4,
      borderRadius: 2,
      background: 'var(--line-2)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 16px 12px',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, "Language"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-3)',
      marginTop: 2
    }
  }, "Choose your preferred app language")), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 28,
      height: 28,
      borderRadius: 14,
      background: 'var(--bg-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-2)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "close",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px 8px',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 12px',
      borderRadius: 9,
      background: 'var(--bg)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "search",
    size: 16,
    style: {
      color: 'var(--text-3)'
    }
  }), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Search language\u2026",
    style: {
      flex: 1,
      fontSize: 13,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '4px 8px 12px'
    }
  }, filtered.map(l => {
    const sel = selected === l.code;
    return /*#__PURE__*/React.createElement("button", {
      key: l.code,
      onClick: () => setSelected(l.code),
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 12px',
        borderRadius: 10,
        marginBottom: 4,
        background: sel ? 'var(--acc-3)' : 'transparent',
        border: sel ? '1.5px solid var(--acc)' : '1.5px solid transparent',
        textAlign: 'left'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 22,
        flexShrink: 0,
        width: 30,
        textAlign: 'center'
      }
    }, l.flag), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13.5,
        fontWeight: 700,
        color: 'var(--ink)'
      }
    }, l.native), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: 'var(--text-3)',
        marginTop: 1
      }
    }, l.name, " ", /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: 'var(--muted)'
      }
    }, "\xB7 ", l.code))), sel && /*#__PURE__*/React.createElement(Mi, {
      name: "check_circle",
      size: 18,
      fill: true,
      style: {
        color: 'var(--acc-2)'
      }
    }));
  }), filtered.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '30px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12.5
    }
  }, "No matching language")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 16px 16px',
      background: 'var(--surface)',
      borderTop: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: save,
    style: {
      width: '100%',
      padding: '13px 0',
      borderRadius: 10,
      fontSize: 14,
      fontWeight: 700,
      color: '#fff',
      background: 'var(--acc)'
    }
  }, "Use ", (LANGUAGES.find(l => l.code === selected) || {}).native || selected), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-3)',
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 1.4
    }
  }, "Some content may remain in English."))));
}

// ── CurrencySheet ──
function CurrencySheet({
  onClose
}) {
  const [selected, setSelected] = useState(getPrefs().currency || 'USD');
  const [search, setSearch] = useState('');
  function save() {
    setPref('currency', selected);
    onClose();
  }
  const filtered = CURRENCIES.filter(c => !search || c.code.toLowerCase().includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase()));
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-sheet-overlay",
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(10,14,26,0.55)',
      zIndex: 300,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: 'var(--surface)',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      display: 'flex',
      flexDirection: 'column',
      maxHeight: '88%',
      animation: 'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      padding: '8px 0 4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 4,
      borderRadius: 2,
      background: 'var(--line-2)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 16px 12px',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, "Account Currency"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-3)',
      marginTop: 2
    }
  }, "Display balances and P/L in your preferred currency")), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 28,
      height: 28,
      borderRadius: 14,
      background: 'var(--bg-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-2)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "close",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px 8px',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 12px',
      borderRadius: 9,
      background: 'var(--bg)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "search",
    size: 16,
    style: {
      color: 'var(--text-3)'
    }
  }), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Search currency\u2026",
    style: {
      flex: 1,
      fontSize: 13,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '4px 8px 12px'
    }
  }, filtered.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '30px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12.5
    }
  }, "No matching currency"), filtered.map(c => {
    const sel = selected === c.code;
    return /*#__PURE__*/React.createElement("button", {
      key: c.code,
      onClick: () => setSelected(c.code),
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 12px',
        borderRadius: 10,
        marginBottom: 4,
        background: sel ? 'var(--acc-3)' : 'transparent',
        border: sel ? '1.5px solid var(--acc)' : '1.5px solid transparent',
        textAlign: 'left'
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "mono",
      style: {
        width: 38,
        height: 38,
        borderRadius: 9,
        flexShrink: 0,
        background: sel ? 'var(--acc)' : 'var(--bg-2)',
        color: sel ? '#fff' : 'var(--ink)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 15,
        fontWeight: 700
      }
    }, c.symbol), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--ink)',
        letterSpacing: 0.3
      }
    }, c.code), c.code === 'USDT' && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 8,
        fontWeight: 800,
        padding: '1px 4px',
        borderRadius: 3,
        background: '#E0F2F1',
        color: '#00796B',
        letterSpacing: 0.3
      }
    }, "STABLECOIN")), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: 'var(--text-3)',
        marginTop: 2
      }
    }, c.name)), /*#__PURE__*/React.createElement("div", {
      className: "mono",
      style: {
        fontSize: 10.5,
        color: 'var(--text-3)',
        textAlign: 'right'
      }
    }, c.code !== 'USD' && /*#__PURE__*/React.createElement(React.Fragment, null, "1 USD", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-2)',
        fontWeight: 600
      }
    }, "= ", c.rate, " ", c.code)), c.code === 'USD' && /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--acc-2)',
        fontWeight: 700
      }
    }, "BASE")), sel && /*#__PURE__*/React.createElement(Mi, {
      name: "check_circle",
      size: 18,
      fill: true,
      style: {
        color: 'var(--acc-2)',
        flexShrink: 0
      }
    }));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 16px 16px',
      background: 'var(--surface)',
      borderTop: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: save,
    style: {
      width: '100%',
      padding: '13px 0',
      borderRadius: 10,
      fontSize: 14,
      fontWeight: 700,
      color: '#fff',
      background: 'var(--acc)'
    }
  }, "Use ", selected), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-3)',
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 1.4
    }
  }, "Conversion rates updated daily. Trade execution remains in instrument currency."))));
}

// ── Price Alerts ──
function getAlerts() {
  try {
    return JSON.parse(localStorage.getItem('alpexa.alerts') || '[]');
  } catch (e) {
    return [];
  }
}
function saveAlerts(a) {
  try {
    localStorage.setItem('alpexa.alerts', JSON.stringify(a));
  } catch (e) {}
}
function PriceAlertsPanel() {
  const [alerts, setAlerts] = useState(getAlerts());
  const [adding, setAdding] = useState(false);
  const [sym, setSym] = useState('EURUSD');
  const [side, setSide] = useState('above');
  const [px, setPx] = useState('');
  function add() {
    if (!px || isNaN(parseFloat(px))) return;
    const next = [...alerts, {
      id: Date.now(),
      sym,
      side,
      px: parseFloat(px),
      active: true
    }];
    setAlerts(next);
    saveAlerts(next);
    setAdding(false);
    setPx('');
  }
  function toggle(id) {
    const next = alerts.map(a => a.id === id ? {
      ...a,
      active: !a.active
    } : a);
    setAlerts(next);
    saveAlerts(next);
  }
  function remove(id) {
    const next = alerts.filter(a => a.id !== id);
    setAlerts(next);
    saveAlerts(next);
  }
  const symInfo = ALPEXA_MARKET.SYMBOLS.find(s => s.sym === sym);
  const digits = symInfo ? symInfo.digits : 5;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '4px 16px 18px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setAdding(!adding),
    style: {
      width: '100%',
      padding: '12px 0',
      borderRadius: 10,
      marginBottom: 14,
      background: adding ? 'var(--bg-2)' : 'var(--acc)',
      color: adding ? 'var(--text-2)' : '#fff',
      fontSize: 13,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: adding ? 'close' : 'add_alert',
    size: 16
  }), adding ? 'Cancel' : 'Create New Alert'), adding && /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg)',
      borderRadius: 11,
      padding: '12px 14px',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      marginBottom: 6
    }
  }, "SYMBOL"), /*#__PURE__*/React.createElement("select", {
    value: sym,
    onChange: e => setSym(e.target.value),
    className: "mono",
    style: {
      width: '100%',
      padding: '9px 10px',
      borderRadius: 8,
      border: '1px solid var(--line-2)',
      background: 'var(--surface)',
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--ink)',
      marginBottom: 12,
      outline: 'none'
    }
  }, alpexaTradable(ALPEXA_MARKET.SYMBOLS).map(s => /*#__PURE__*/React.createElement("option", {
    key: s.sym,
    value: s.sym
  }, s.sym, " \u2014 ", s.name))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      marginBottom: 6
    }
  }, "CONDITION"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setSide('above'),
    style: {
      flex: 1,
      padding: '10px 0',
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 700,
      background: side === 'above' ? 'var(--buy-tint)' : 'var(--surface)',
      color: side === 'above' ? 'var(--buy-2)' : 'var(--text-2)',
      border: '1px solid ' + (side === 'above' ? 'var(--buy)' : 'var(--line-2)'),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "arrow_upward",
    size: 14
  }), "Price rises above"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setSide('below'),
    style: {
      flex: 1,
      padding: '10px 0',
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 700,
      background: side === 'below' ? 'var(--sell-tint)' : 'var(--surface)',
      color: side === 'below' ? 'var(--sell-2)' : 'var(--text-2)',
      border: '1px solid ' + (side === 'below' ? 'var(--sell)' : 'var(--line-2)'),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "arrow_downward",
    size: 14
  }), "Price falls below")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      marginBottom: 6
    }
  }, "TARGET PRICE"), /*#__PURE__*/React.createElement("input", {
    value: px,
    onChange: e => setPx(e.target.value),
    type: "number",
    step: "any",
    placeholder: `e.g. ${1.0850.toFixed(digits)}`,
    className: "mono",
    style: {
      width: '100%',
      padding: '10px 12px',
      borderRadius: 8,
      border: '1.5px solid var(--line-2)',
      background: 'var(--surface)',
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--ink)',
      outline: 'none',
      marginBottom: 12
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: add,
    disabled: !px,
    style: {
      width: '100%',
      padding: '12px 0',
      borderRadius: 9,
      fontSize: 13,
      fontWeight: 700,
      color: '#fff',
      background: px ? 'var(--acc)' : 'var(--muted)',
      cursor: px ? 'pointer' : 'not-allowed'
    }
  }, "Create Alert")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      marginBottom: 6
    }
  }, "ACTIVE ALERTS (", alerts.filter(a => a.active).length, ")"), alerts.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "notifications_off",
    size: 36,
    style: {
      color: 'var(--muted)',
      display: 'block',
      margin: '0 auto 8px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--text-2)'
    }
  }, "No price alerts yet"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      marginTop: 4,
      color: 'var(--text-3)'
    }
  }, "Tap \"Create New Alert\" to set one up")), alerts.map(a => {
    const info = ALPEXA_MARKET.SYMBOLS.find(s => s.sym === a.sym);
    const d = info ? info.digits : 5;
    return /*#__PURE__*/React.createElement("div", {
      key: a.id,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 12px',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 9,
        marginBottom: 5,
        opacity: a.active ? 1 : 0.55
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 32,
        height: 32,
        borderRadius: 8,
        flexShrink: 0,
        background: a.side === 'above' ? 'var(--buy-tint)' : 'var(--sell-tint)',
        color: a.side === 'above' ? 'var(--buy-2)' : 'var(--sell-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(Mi, {
      name: a.side === 'above' ? 'arrow_upward' : 'arrow_downward',
      size: 16,
      weight: 600
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--ink)'
      }
    }, a.sym), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        color: 'var(--text-3)'
      }
    }, a.side === 'above' ? '≥' : '≤'), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--ink)'
      }
    }, Number(a.px).toFixed(d))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: 'var(--text-3)',
        marginTop: 1
      }
    }, info ? info.name : '', " \xB7 ", a.active ? 'Monitoring' : 'Paused')), /*#__PURE__*/React.createElement("button", {
      onClick: () => toggle(a.id),
      style: {
        width: 36,
        height: 22,
        borderRadius: 11,
        position: 'relative',
        background: a.active ? 'var(--acc-2)' : 'var(--muted)',
        transition: 'background 0.2s'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 18,
        height: 18,
        background: '#fff',
        borderRadius: 9,
        position: 'absolute',
        top: 2,
        left: a.active ? 16 : 2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left 0.2s'
      }
    })), /*#__PURE__*/React.createElement("button", {
      onClick: () => remove(a.id),
      style: {
        width: 26,
        height: 26,
        borderRadius: 13,
        color: 'var(--text-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(Mi, {
      name: "delete",
      size: 16
    })));
  }));
}

// ── Notifications Panel ──
const DEFAULT_NOTIF = {
  orderFilled: {
    push: true,
    email: true
  },
  pendingTriggered: {
    push: true,
    email: false
  },
  slTpHit: {
    push: true,
    email: true
  },
  priceAlert: {
    push: true,
    email: false
  },
  marginCall: {
    push: true,
    email: true
  },
  newsHigh: {
    push: true,
    email: false
  },
  newsMedium: {
    push: false,
    email: false
  },
  deposit: {
    push: true,
    email: true
  },
  withdrawal: {
    push: true,
    email: true
  },
  login: {
    push: false,
    email: true
  },
  weeklySummary: {
    push: false,
    email: true
  }
};
function getNotifPrefs() {
  try {
    return {
      ...DEFAULT_NOTIF,
      ...JSON.parse(localStorage.getItem('alpexa.notif') || '{}')
    };
  } catch (e) {
    return {
      ...DEFAULT_NOTIF
    };
  }
}
function saveNotifPrefs(p) {
  try {
    localStorage.setItem('alpexa.notif', JSON.stringify(p));
  } catch (e) {}
}
// Fire an in-app notification (respects the user's push toggles via `pref`).
window.alpexaNotify = function (d) {
  try {
    if (d && d.pref) {
      var p = getNotifPrefs()[d.pref];
      if (p && p.push === false) return;
    }
    window.dispatchEvent(new CustomEvent('alpexa-notify', {
      detail: d || {}
    }));
  } catch (e) {}
};
const NOTIF_LABELS = [{
  group: 'Trading',
  items: [{
    key: 'orderFilled',
    label: 'Order Filled',
    sub: 'Market orders executed',
    icon: 'task_alt'
  }, {
    key: 'pendingTriggered',
    label: 'Pending Order Triggered',
    sub: 'Limit/Stop activated',
    icon: 'bolt'
  }, {
    key: 'slTpHit',
    label: 'SL / TP Hit',
    sub: 'Position auto-closed',
    icon: 'flag'
  }, {
    key: 'marginCall',
    label: 'Margin Call',
    sub: 'Account at risk',
    icon: 'warning'
  }]
}, {
  group: 'Market',
  items: [{
    key: 'priceAlert',
    label: 'Price Alerts',
    sub: 'Custom price targets',
    icon: 'notifications_active'
  }, {
    key: 'newsHigh',
    label: 'High-Impact News',
    sub: 'FOMC, NFP, CPI, etc.',
    icon: 'campaign'
  }, {
    key: 'newsMedium',
    label: 'Medium-Impact News',
    sub: 'GDP, PMI, retail sales',
    icon: 'feed'
  }]
}, {
  group: 'Account',
  items: [{
    key: 'deposit',
    label: 'Deposits',
    sub: 'Funds added',
    icon: 'south'
  }, {
    key: 'withdrawal',
    label: 'Withdrawals',
    sub: 'Funds removed',
    icon: 'north'
  }, {
    key: 'login',
    label: 'New Sign-in',
    sub: 'Security alerts',
    icon: 'login'
  }, {
    key: 'weeklySummary',
    label: 'Weekly Summary',
    sub: 'P/L digest every Mon',
    icon: 'mail'
  }]
}];
function NotifCheck({
  on,
  onChange
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: () => onChange(!on),
    style: {
      width: 44,
      display: 'flex',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 20,
      height: 20,
      borderRadius: 5,
      background: on ? 'var(--acc)' : 'transparent',
      border: '2px solid ' + (on ? 'var(--acc)' : 'var(--muted)'),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, on && /*#__PURE__*/React.createElement(Mi, {
    name: "check",
    size: 12,
    style: {
      color: '#fff'
    }
  })));
}
function NotificationsPanel() {
  const [prefs, setPrefsState] = useState(getNotifPrefs());
  function update(key, ch, val) {
    const next = {
      ...prefs,
      [key]: {
        ...prefs[key],
        [ch]: val
      }
    };
    setPrefsState(next);
    saveNotifPrefs(next);
  }
  function bulk(channel, val) {
    const next = {
      ...prefs
    };
    Object.keys(next).forEach(k => {
      next[k] = {
        ...next[k],
        [channel]: val
      };
    });
    setPrefsState(next);
    saveNotifPrefs(next);
  }
  const totalPush = Object.values(prefs).filter(p => p.push).length;
  const totalEmail = Object.values(prefs).filter(p => p.email).length;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '4px 16px 18px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: '10px 12px',
      borderRadius: 9,
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "notifications",
    size: 18,
    style: {
      color: 'var(--acc-2)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, "Push"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      color: 'var(--text-3)'
    }
  }, totalPush, "/", Object.keys(prefs).length, " on")), /*#__PURE__*/React.createElement("button", {
    onClick: () => bulk('push', totalPush < Object.keys(prefs).length),
    style: {
      fontSize: 10.5,
      fontWeight: 700,
      color: 'var(--acc-2)',
      padding: '4px 8px',
      borderRadius: 6,
      background: 'var(--acc-3)'
    }
  }, totalPush === Object.keys(prefs).length ? 'OFF' : 'ALL')), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: '10px 12px',
      borderRadius: 9,
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "mail",
    size: 18,
    style: {
      color: 'var(--acc-2)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, "Email"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      color: 'var(--text-3)'
    }
  }, totalEmail, "/", Object.keys(prefs).length, " on")), /*#__PURE__*/React.createElement("button", {
    onClick: () => bulk('email', totalEmail < Object.keys(prefs).length),
    style: {
      fontSize: 10.5,
      fontWeight: 700,
      color: 'var(--acc-2)',
      padding: '4px 8px',
      borderRadius: 6,
      background: 'var(--acc-3)'
    }
  }, totalEmail === Object.keys(prefs).length ? 'OFF' : 'ALL'))), NOTIF_LABELS.map(group => /*#__PURE__*/React.createElement("div", {
    key: group.group,
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      marginBottom: 6,
      padding: '0 2px'
    }
  }, group.group.toUpperCase()), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: 10,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      padding: '7px 12px',
      background: 'var(--bg)',
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 44,
      textAlign: 'center'
    }
  }, "PUSH"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 44,
      textAlign: 'center'
    }
  }, "EMAIL")), group.items.map(item => /*#__PURE__*/React.createElement("div", {
    key: item.key,
    style: {
      display: 'flex',
      alignItems: 'center',
      padding: '10px 12px',
      borderTop: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      flexShrink: 0,
      background: 'var(--bg-2)',
      color: 'var(--text-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: item.icon,
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--ink)'
    }
  }, item.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      marginTop: 1
    }
  }, item.sub)), /*#__PURE__*/React.createElement(NotifCheck, {
    on: prefs[item.key].push,
    onChange: v => update(item.key, 'push', v)
  }), /*#__PURE__*/React.createElement(NotifCheck, {
    on: prefs[item.key].email,
    onChange: v => update(item.key, 'email', v)
  })))))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--acc-3)',
      borderRadius: 9,
      padding: '10px 12px',
      marginTop: 6,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      fontSize: 11.5,
      color: 'var(--acc-2)',
      lineHeight: 1.4
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "info",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, "Notifications are sent to your registered email and registered device.")));
}

// ── 2FA / Sessions / Terms / Support ──
function TwoFactorPanel() {
  const [method, setMethod] = useState('app');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '4px 16px 18px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--buy-tint)',
      borderRadius: 10,
      padding: '12px 14px',
      marginBottom: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "verified_user",
    size: 20,
    style: {
      color: 'var(--buy-2)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      fontWeight: 700,
      color: 'var(--buy-2)'
    }
  }, "Secure your withdrawals"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--buy-2)',
      opacity: 0.85,
      marginTop: 1
    }
  }, "Add a 2-factor verification step"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      marginBottom: 6
    }
  }, "METHOD"), [{
    v: 'app',
    icon: 'phonelink_lock',
    label: 'Authenticator App',
    sub: 'Google / Authy / 1Password'
  }, {
    v: 'sms',
    icon: 'sms',
    label: 'SMS Code',
    sub: 'Add a phone number'
  }, {
    v: 'email',
    icon: 'mail',
    label: 'Email Code',
    sub: function () {
      try {
        var e = JSON.parse(localStorage.getItem('alpexa.me') || '{}').email || '';
        return e ? e.replace(/^(.).*(@.*)$/, '$1•••$2') : 'Your account email';
      } catch (_) {
        return 'Your account email';
      }
    }()
  }].map(o => /*#__PURE__*/React.createElement("button", {
    key: o.v,
    onClick: () => setMethod(o.v),
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px',
      background: method === o.v ? 'var(--acc-3)' : 'var(--bg-2)',
      border: '1.5px solid ' + (method === o.v ? 'var(--acc)' : 'transparent'),
      borderRadius: 10,
      marginBottom: 6,
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 8,
      flexShrink: 0,
      background: method === o.v ? 'var(--acc)' : 'var(--surface)',
      color: method === o.v ? 'var(--ink-fg)' : 'var(--text-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: o.icon,
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, o.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-3)',
      marginTop: 1
    }
  }, o.sub)), method === o.v && /*#__PURE__*/React.createElement(Mi, {
    name: "check_circle",
    size: 18,
    fill: true,
    style: {
      color: 'var(--acc-2)'
    }
  }))), /*#__PURE__*/React.createElement("button", {
    style: {
      width: '100%',
      padding: '11px 0',
      borderRadius: 9,
      marginTop: 10,
      background: 'var(--bg-2)',
      color: 'var(--text-2)',
      fontSize: 12,
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "refresh",
    size: 14
  }), "Regenerate backup codes"), /*#__PURE__*/React.createElement("button", {
    style: {
      width: '100%',
      padding: '11px 0',
      borderRadius: 9,
      marginTop: 6,
      background: 'var(--sell-tint)',
      color: 'var(--sell-2)',
      fontSize: 12,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "cancel",
    size: 14
  }), "Disable 2FA"));
}
function SessionsPanel() {
  const sessions = [{
    id: 1,
    device: 'iPhone 15 Pro',
    os: 'iOS 18.4',
    loc: 'Seoul, KR',
    ip: '175.223.•••.42',
    current: true,
    time: 'Active now'
  }, {
    id: 2,
    device: 'MacBook Pro',
    os: 'macOS 14.5',
    loc: 'Seoul, KR',
    ip: '175.223.•••.42',
    current: false,
    time: '2 hours ago'
  }, {
    id: 3,
    device: 'Chrome',
    os: 'Windows 11',
    loc: 'Tokyo, JP',
    ip: '126.108.•••.18',
    current: false,
    time: 'Yesterday, 14:32'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '4px 16px 18px'
    }
  }, sessions.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.id,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px',
      background: 'var(--surface)',
      border: '1px solid ' + (s.current ? 'var(--acc)' : 'var(--line)'),
      borderRadius: 10,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 8,
      flexShrink: 0,
      background: s.current ? 'var(--acc-3)' : 'var(--bg-2)',
      color: s.current ? 'var(--acc-2)' : 'var(--text-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: s.device.includes('iPhone') ? 'phone_iphone' : s.device.includes('Mac') || s.device.includes('Book') ? 'laptop_mac' : 'desktop_windows',
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, s.device), s.current && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 8.5,
      padding: '1px 5px',
      borderRadius: 3,
      fontWeight: 800,
      letterSpacing: 0.3,
      background: 'var(--buy-tint)',
      color: 'var(--buy-2)'
    }
  }, "THIS DEVICE")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-3)',
      marginTop: 2
    }
  }, s.os, " \xB7 ", s.loc), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 9.5,
      color: 'var(--text-3)',
      marginTop: 1
    }
  }, s.ip, " \xB7 ", s.time)), !s.current && /*#__PURE__*/React.createElement("button", {
    style: {
      width: 28,
      height: 28,
      borderRadius: 14,
      background: 'var(--sell-tint)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--sell-2)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "logout",
    size: 16
  })))), /*#__PURE__*/React.createElement("button", {
    style: {
      width: '100%',
      padding: '12px 0',
      borderRadius: 10,
      marginTop: 10,
      background: 'var(--sell-tint)',
      color: 'var(--sell-2)',
      fontSize: 13,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "logout",
    size: 16
  }), "Sign out of all other devices"));
}
function TermsPanel() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '4px 16px 18px',
      fontSize: 12,
      color: 'var(--text-2)',
      lineHeight: 1.6
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontWeight: 700,
      color: 'var(--ink)',
      marginBottom: 8
    }
  }, "1. Risk Disclosure"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: 14
    }
  }, "Trading leveraged products carries significant risk and may result in loss of capital exceeding deposits. By using this platform you acknowledge you understand these risks."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontWeight: 700,
      color: 'var(--ink)',
      marginBottom: 8
    }
  }, "2. Account Eligibility"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: 14
    }
  }, "You must be at least 18 years old and a resident of an eligible jurisdiction. Identity verification (KYC) is required before live trading."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontWeight: 700,
      color: 'var(--ink)',
      marginBottom: 8
    }
  }, "3. Order Execution"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: 14
    }
  }, "Orders are filled at the best available market price. Slippage may occur during high volatility periods. ALPEXA is not responsible for losses arising from price gaps or feed delays."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontWeight: 700,
      color: 'var(--ink)',
      marginBottom: 8
    }
  }, "4. Funds Safety"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: 14
    }
  }, "Client funds are held in segregated accounts at tier-1 banks. ALPEXA SUISSE is regulated by FINMA (Swiss Financial Market Supervisory Authority)."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontWeight: 700,
      color: 'var(--ink)',
      marginBottom: 8
    }
  }, "5. Privacy"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: 14
    }
  }, "Your personal data is processed in accordance with our Privacy Policy and applicable laws (GDPR, Swiss FADP). Trading data is encrypted at rest and in transit."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-3)',
      marginTop: 12,
      padding: '10px 12px',
      background: 'var(--bg)',
      borderRadius: 8
    }
  }, "Last revised: May 10, 2026 \xB7 Full document available at ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--acc-2)',
      textDecoration: 'underline'
    }
  }, "alpexa.com/terms")));
}
function SupportPanel() {
  const [topic, setTopic] = useState('');
  const [msg, setMsg] = useState('');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '4px 16px 18px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
      marginBottom: 14
    }
  }, [{
    icon: 'call',
    label: 'Phone',
    sub: '+41 22 555 9900',
    href: 'tel:+41225559900'
  }, {
    icon: 'mail',
    label: 'Email',
    sub: 'support@alpexa.com',
    href: 'mailto:support@alpexa.com'
  }].map(o => /*#__PURE__*/React.createElement("button", {
    key: o.label,
    onClick: () => {
      window.location.href = o.href;
    },
    style: {
      padding: '14px 12px',
      borderRadius: 10,
      background: 'var(--bg)',
      border: '1px solid var(--line)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 4,
      textAlign: 'left',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: 'var(--acc-3)',
      color: 'var(--acc-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: o.icon,
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      fontWeight: 700,
      color: 'var(--ink)',
      marginTop: 4
    }
  }, o.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)'
    }
  }, o.sub)))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      marginBottom: 6
    }
  }, "SUBMIT A TICKET"), /*#__PURE__*/React.createElement("select", {
    value: topic,
    onChange: e => setTopic(e.target.value),
    style: {
      width: '100%',
      padding: '10px 12px',
      borderRadius: 8,
      border: '1px solid var(--line-2)',
      background: 'var(--surface)',
      fontSize: 13,
      color: 'var(--ink)',
      marginBottom: 10,
      outline: 'none'
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Select a topic\u2026"), /*#__PURE__*/React.createElement("option", {
    value: "deposit"
  }, "Deposit / Withdrawal"), /*#__PURE__*/React.createElement("option", {
    value: "trade"
  }, "Trading / Order Execution"), /*#__PURE__*/React.createElement("option", {
    value: "account"
  }, "Account / Verification"), /*#__PURE__*/React.createElement("option", {
    value: "tech"
  }, "Technical Issue"), /*#__PURE__*/React.createElement("option", {
    value: "other"
  }, "Other")), /*#__PURE__*/React.createElement("textarea", {
    value: msg,
    onChange: e => setMsg(e.target.value),
    placeholder: "Describe your issue\u2026",
    style: {
      width: '100%',
      padding: '10px 12px',
      borderRadius: 8,
      border: '1px solid var(--line-2)',
      background: 'var(--surface)',
      fontSize: 13,
      color: 'var(--ink)',
      minHeight: 90,
      outline: 'none',
      resize: 'vertical',
      fontFamily: 'inherit',
      marginBottom: 10
    }
  }), /*#__PURE__*/React.createElement("button", {
    disabled: !topic || !msg,
    onClick: () => {
      if (!topic || !msg) return;
      const subj = encodeURIComponent('ALPEXA Support — ' + topic);
      const body = encodeURIComponent(msg + '\n\n— sent from ALPEXA FX');
      window.location.href = 'mailto:support@alpexa.com?subject=' + subj + '&body=' + body;
    },
    style: {
      width: '100%',
      padding: '12px 0',
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 700,
      color: '#fff',
      background: topic && msg ? 'var(--acc)' : 'var(--muted)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      cursor: topic && msg ? 'pointer' : 'not-allowed'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "send",
    size: 14
  }), "Submit Ticket"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-3)',
      textAlign: 'center',
      marginTop: 8
    }
  }, "Typical response time: 4 hours \xB7 24/7 support"));
}

// ── SettingSheet dispatcher ──
function SettingSheet({
  kind,
  onClose
}) {
  const titles = {
    alerts: {
      title: 'Price Alerts',
      sub: 'Get notified when prices hit your targets'
    },
    notif: {
      title: 'Notifications',
      sub: 'Manage push and email notifications'
    },
    '2fa': {
      title: 'Two-Factor Auth',
      sub: 'Enabled · Authenticator app'
    },
    sessions: {
      title: 'Active Sessions',
      sub: 'Devices currently signed in'
    },
    terms: {
      title: 'Terms of Use',
      sub: 'Last updated May 10, 2026'
    },
    support: {
      title: 'Support',
      sub: 'Get help from our team'
    }
  };
  const t = titles[kind] || {
    title: 'Settings',
    sub: ''
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-sheet-overlay",
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(10,14,26,0.55)',
      zIndex: 300,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: 'var(--surface)',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      display: 'flex',
      flexDirection: 'column',
      maxHeight: '88%',
      overflow: 'hidden',
      animation: 'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      padding: '8px 0 4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 4,
      borderRadius: 2,
      background: 'var(--line-2)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 16px 12px',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, t.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-3)',
      marginTop: 2
    }
  }, t.sub)), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 28,
      height: 28,
      borderRadius: 14,
      background: 'var(--bg-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-2)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "close",
    size: 14
  }))), kind === 'alerts' && /*#__PURE__*/React.createElement(PriceAlertsPanel, null), kind === 'notif' && /*#__PURE__*/React.createElement(NotificationsPanel, null), kind === '2fa' && /*#__PURE__*/React.createElement(TwoFactorPanel, null), kind === 'sessions' && /*#__PURE__*/React.createElement(SessionsPanel, null), kind === 'terms' && /*#__PURE__*/React.createElement(TermsPanel, null), kind === 'support' && /*#__PURE__*/React.createElement(SupportPanel, null)));
}

// ── AcctSheet (deposit / withdraw / transfer / report) ──
function AcctSheet({
  kind,
  presetMethod,
  onNavigate,
  onClose,
  account
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(presetMethod || (kind === 'deposit' ? 'card' : kind === 'withdraw' ? 'bank' : 'live'));
  const [destAcct, setDestAcct] = useState('stocks');
  const [wAddr, setWAddr] = useState(''); // USDT (ERC-20) withdrawal destination
  const [reportType, setReportType] = useState('monthly');
  const [reportFormat, setReportFormat] = useState('pdf');
  const [step, setStep] = useState('form');
  const [err, setErr] = useState(''); // inline form error (replaces native alert() — better mobile UX)
  const TITLES = {
    deposit: {
      title: 'Deposit Funds',
      sub: 'Funds available immediately for trading'
    },
    withdraw: {
      title: 'Withdraw Funds',
      sub: 'Processed within 1–3 business days'
    },
    transfer: {
      title: 'Transfer Between Accounts',
      sub: 'Instant, no fees'
    },
    report: {
      title: 'Account Report',
      sub: 'Statement of your trading activity'
    }
  };
  const t = TITLES[kind];
  function submit() {
    setErr('');
    if (kind !== 'report' && !amount) return;
    // Crypto (USDT) withdrawal must have a valid 0x… address (else the back office can't pay it).
    if (kind === 'withdraw' && (method === 'wallet' || method === 'crypto') && !/^0x[0-9a-fA-F]{40}$/.test((wAddr || '').trim())) {
      setErr('Enter a valid USDT (ERC-20) wallet address (0x…).');
      return;
    }
    setStep('processing');
    setTimeout(async () => {
      // Record funding transactions to history (skip 'report' since it's not a money move)
      if (kind === 'deposit' || kind === 'withdraw' || kind === 'transfer') {
        const METHOD_NOTE = {
          card: 'Card payment',
          bank: kind === 'withdraw' ? 'Bank transfer' : 'Bank wire',
          crypto: 'USDT (ERC-20)',
          wallet: 'USDT (ERC-20)',
          live: 'From FX'
        };
        const REF_PREFIX = {
          deposit: 'DEP-ALX-',
          withdraw: 'WTH-ALX-',
          transfer: 'TRF-ALX-'
        };
        const note = kind === 'transfer' ? 'FX → ' + (destAcct || '').toUpperCase() : METHOD_NOTE[method] || '';
        const amt = parseFloat(amount) || 0;
        const reqId = 'fx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        if (kind === 'transfer') {
          // INSTANT server-side transfer via RPC (atomic + idempotent). Server
          // validates ownership + balance; no client ledger writes, no approval.
          const acctOf = k => {
            try {
              var a = JSON.parse(localStorage.getItem('alpexa.me') || '{}').accts || {};
              if (k === 'sports') return a.sports;
              if (k === 'crypto') return a.crypto;
              return a.fx;
            } catch (e) {
              return '';
            }
          };
          const fromAcct = acctOf('fx'),
            toAcct = acctOf(destAcct || 'crypto');
          const ref = 'xfer-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
          if (window.AlpexaSync && AlpexaSync.db && fromAcct && toAcct) {
            AlpexaSync.db.rpc('app_transfer', {
              p_ref: ref,
              p_from: fromAcct,
              p_to: toAcct,
              p_amount: amt
            }).then(function (r) {
              const res = r && r.data;
              if (res && res.ok) {
                try {
                  pushFundingHistory({
                    id: ref,
                    kind: 'transfer',
                    method: 'Internal transfer',
                    amount: amt,
                    currency: 'USD',
                    ref: REF_PREFIX.transfer + Math.floor(10000000 + Math.random() * 89999999),
                    note,
                    account: 'live',
                    destAcct: destAcct,
                    status: 'approved'
                  });
                } catch (e) {}
                // Optimistic: reflect both legs instantly in the local balance cache.
                try {
                  window.addBalance && window.addBalance('live', -amt);
                  window.addBalance && window.addBalance(destAcct || 'crypto', amt);
                } catch (e) {}
                // Refresh ALL server balances now so both legs reflect immediately.
                try {
                  AlpexaSync.pullBalances && AlpexaSync.pullBalances().then(function (b) {
                    if (!b) return;
                    try {
                      var o = window.__fxSrvBal || {};
                      if (b.fx != null) o.fx = b.fx;
                      if (b.sports != null) o.sports = b.sports;
                      if (b.crypto != null) o.crypto = b.crypto;
                      window.__fxSrvBal = o;
                      window.dispatchEvent(new Event('alpexa-balance-change'));
                    } catch (e) {}
                  });
                } catch (e) {}
              }
            }, function () {});
          }
          try {
            window.alpexaNotify && alpexaNotify({
              type: 'transfer',
              pref: 'deposit',
              title: 'Transfer complete · $' + amt.toLocaleString()
            });
          } catch (e) {}
          setStep('done');
        } else if (kind === 'withdraw') {
          // Server-first: the withdrawal must reach the back office (requests table) BEFORE we
          // show success. No silent local-only withdrawals.
          if (!(window.AlpexaSync && AlpexaSync.pushRequest)) {
            setStep('form');
            setErr('No server connection — withdrawal not submitted. Please try again.');
            return;
          }
          let res;
          try {
            res = await AlpexaSync.pushRequest({
              id: reqId,
              type: 'withdraw',
              server: 'FX',
              amount: amt,
              asset: 'USD',
              network: method,
              address: method === 'wallet' || method === 'crypto' ? (wAddr || '').trim() : ''
            });
          } catch (e) {
            res = {
              error: e
            };
          }
          if (!res || res.skipped || res.error) {
            setStep('form');
            setErr('Withdrawal not submitted — couldn’t reach the server. Nothing was deducted. Please try again.');
            return;
          }
          try {
            pushFundingHistory({
              id: reqId,
              kind,
              method,
              amount: amt,
              currency: 'USD',
              ref: REF_PREFIX.withdraw + Math.floor(10000000 + Math.random() * 89999999),
              note,
              account: account || 'live',
              status: 'pending'
            });
          } catch (e) {}
          try {
            window.alpexaNotify && alpexaNotify({
              type: 'withdraw',
              pref: 'withdrawal',
              title: 'Withdrawal requested · $' + amt.toLocaleString() + ' · pending approval'
            });
          } catch (e) {}
          setStep('done');
        } else {
          // Deposit — record + push (unchanged fire-and-forget; only withdraw is server-gated).
          try {
            pushFundingHistory({
              id: reqId,
              kind,
              method,
              amount: amt,
              currency: 'USD',
              ref: REF_PREFIX[kind] + Math.floor(10000000 + Math.random() * 89999999),
              note,
              account: account || 'live',
              status: 'pending'
            });
          } catch (e) {}
          try {
            window.AlpexaSync && AlpexaSync.pushRequest({
              id: reqId,
              type: kind,
              server: 'FX',
              amount: amt,
              asset: 'USD',
              network: method,
              address: method === 'wallet' || method === 'crypto' ? (wAddr || '').trim() : ''
            });
          } catch (e) {}
          try {
            window.alpexaNotify && alpexaNotify({
              type: kind,
              pref: 'deposit',
              title: 'Deposit requested · $' + amt.toLocaleString() + ' · pending approval'
            });
          } catch (e) {}
          setStep('done');
        }
      } else {
        setStep('done');
      }
    }, 1300);
  }
  const QUICK = [100, 500, 1000, 5000];
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-sheet-overlay",
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(10,14,26,0.55)',
      zIndex: 300,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: 'var(--surface)',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      display: 'flex',
      flexDirection: 'column',
      maxHeight: '88%',
      overflow: 'hidden',
      animation: 'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      padding: '6px 0 2px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 4,
      borderRadius: 2,
      background: 'var(--line-2)'
    }
  })), step === 'done' ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '22px 22px 28px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 60,
      height: 60,
      borderRadius: 3,
      background: 'rgba(46,111,176,0.16)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 14px',
      border: '1px solid #1B3955'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "check",
    size: 32,
    fill: true,
    style: {
      color: '#1B3955'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: 'var(--ink)',
      marginBottom: 6
    }
  }, kind === 'deposit' && 'Deposit Submitted', kind === 'withdraw' && 'Withdrawal Requested', kind === 'transfer' && 'Transfer Complete', kind === 'report' && 'Report Sent'), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-2)',
      lineHeight: 1.5,
      marginBottom: 18
    }
  }, kind === 'deposit' && /*#__PURE__*/React.createElement(React.Fragment, null, "$ ", amount || '0', " deposit submitted.", /*#__PURE__*/React.createElement("br", null), "Pending back-office approval."), kind === 'withdraw' && /*#__PURE__*/React.createElement(React.Fragment, null, "$ ", amount || '0', " withdrawal requested.", /*#__PURE__*/React.createElement("br", null), "Pending back-office approval."), kind === 'transfer' && /*#__PURE__*/React.createElement(React.Fragment, null, "$ ", amount || '0', " moved instantly.", /*#__PURE__*/React.createElement("br", null), "Your balances are updated."), kind === 'report' && /*#__PURE__*/React.createElement(React.Fragment, null, reportType, " ", reportFormat.toUpperCase(), " report", /*#__PURE__*/React.createElement("br", null), "has been sent to your email.")), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      onClose();
      if (kind === 'deposit' && onNavigate) onNavigate('WATCH');
    },
    style: {
      width: '100%',
      padding: '12px 0',
      borderRadius: 3,
      background: 'linear-gradient(180deg,#2D5478 0%,#1B3955 100%)',
      color: '#fff',
      fontSize: 14,
      fontWeight: 700,
      border: '1px solid #0F2742',
      boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset,0 2px 4px rgba(0,0,0,0.15)'
    }
  }, "Done")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#1B3955',
      color: '#fff',
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      borderBottom: '1px solid #0F2742'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: kind === 'deposit' ? 'south' : kind === 'withdraw' ? 'north' : kind === 'transfer' ? 'swap_horiz' : 'assessment',
    size: 16
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, t.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: '#A9C4DE',
      marginTop: 1
    }
  }, t.sub)), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 26,
      height: 26,
      borderRadius: 13,
      background: 'rgba(255,255,255,0.12)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "close",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      overflowX: 'hidden',
      overscrollBehavior: 'contain',
      padding: '4px 16px 14px'
    }
  }, kind === 'deposit' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SheetLabel, null, "Method"), /*#__PURE__*/React.createElement(MethodGrid, {
    value: account === 'sports' ? 'crypto' : method,
    onChange: account === 'sports' ? v => setMethod('crypto') : setMethod,
    options: account === 'sports' ? [{
      v: 'crypto',
      icon: 'currency_bitcoin',
      label: 'USDT (ERC-20)',
      sub: 'Only USDT accepted · 10 min · 0% fee'
    }] : [{
      v: 'card',
      icon: 'credit_card',
      label: 'Card',
      sub: 'Buy USDT · ~5 min'
    }, {
      v: 'bank',
      icon: 'account_balance',
      label: 'Bank Wire',
      sub: '1–2 days · Free'
    }, {
      v: 'crypto',
      icon: 'currency_bitcoin',
      label: 'Crypto',
      sub: '10 min · 0% fee'
    }]
  }), method === 'card' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SheetLabel, null, "Buy USDT with your card"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      try {
        window.open('https://www.moonpay.com/buy', '_blank');
      } catch (e) {
        try {
          location.href = 'https://www.moonpay.com/buy';
        } catch (_) {}
      }
    },
    style: {
      width: '100%',
      padding: '14px 0',
      borderRadius: 8,
      background: 'var(--acc)',
      color: '#fff',
      border: 'none',
      fontSize: 15,
      fontWeight: 700,
      cursor: 'pointer',
      marginBottom: 10
    }
  }, "Buy USDT with card"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      try {
        window.open('https://portfolio.metamask.io/buy', '_blank');
      } catch (e) {
        try {
          location.href = 'https://portfolio.metamask.io/buy';
        } catch (_) {}
      }
    },
    style: {
      display: 'block',
      margin: '0 auto 16px',
      background: 'none',
      border: 'none',
      color: 'var(--text-3)',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "or use MetaMask"), /*#__PURE__*/React.createElement(SheetLabel, null, "Send USDT (ERC-20) To"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '12px',
      background: '#fff',
      border: '1px solid var(--line-2)',
      borderRadius: 8,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 12,
      color: 'var(--ink)',
      wordBreak: 'break-all'
    }
  }, "0x6B1c8941698Affc56757eF9Be1723Ec43F720966"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-3)',
      marginTop: 3
    }
  }, "Ethereum (ERC-20) only")), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      navigator.clipboard?.writeText('0x6B1c8941698Affc56757eF9Be1723Ec43F720966');
      alert('Address copied');
    },
    style: {
      padding: '7px 13px',
      background: 'var(--acc)',
      color: '#fff',
      border: 'none',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.3,
      flexShrink: 0
    }
  }, "Copy"))), method === 'bank' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SheetLabel, null, "Send Wire To"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid var(--line-2)',
      borderRadius: 9,
      padding: '14px',
      marginBottom: 14,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 11.5,
      lineHeight: 1.7
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      paddingBottom: 8,
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Roboto',
      fontWeight: 700,
      color: 'var(--ink)',
      fontSize: 12
    }
  }, "Nevada State Bank"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      navigator.clipboard?.writeText('984869966');
      alert('Account number copied');
    },
    style: {
      padding: '3px 8px',
      background: 'var(--acc)',
      color: '#fff',
      border: 'none',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.4
    }
  }, "COPY")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, "Beneficiary"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink)',
      fontWeight: 600
    }
  }, "REDROCKFX LLC")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, "Account #"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink)',
      fontWeight: 600
    }
  }, "984869966")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, "ABA / Routing"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink)',
      fontWeight: 600
    }
  }, "122400779")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, "SWIFT/BIC"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink)',
      fontWeight: 600
    }
  }, "ZFNBUS55")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, "Bank address"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink)',
      fontWeight: 600,
      textAlign: 'right'
    }
  }, "9415 W Flamingo Rd, Las Vegas, NV 89147")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, "Reference"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#9F1239',
      fontWeight: 700
    }
  }, (() => {
    try {
      var m = JSON.parse(localStorage.getItem('alpexa.me') || 'null');
      return m && m.custId ? 'ALPX-' + String(m.custId).toUpperCase() : 'ALPX-PENDING';
    } catch (e) {
      return 'ALPX-PENDING';
    }
  })())))), method === 'crypto' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SheetLabel, null, "Send USDT (ERC-20) To"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg)',
      borderRadius: 9,
      padding: '14px',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 140,
      height: 140,
      background: '#fff',
      border: '1px solid var(--line-2)',
      borderRadius: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "120",
    height: "120",
    viewBox: "0 0 120 120",
    xmlns: "http://www.w3.org/2000/svg"
  }, Array.from({
    length: 25 * 25
  }).map((_, i) => {
    const x = i % 25 * 4.8;
    const y = Math.floor(i / 25) * 4.8;
    const fill = (i * 31 + 17) % 7 < 3;
    return fill ? /*#__PURE__*/React.createElement("rect", {
      key: i,
      x: x,
      y: y,
      width: 4.8,
      height: 4.8,
      fill: "#0F1B2D"
    }) : null;
  }), /*#__PURE__*/React.createElement("rect", {
    x: 0,
    y: 0,
    width: 30,
    height: 30,
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("rect", {
    x: 5,
    y: 5,
    width: 20,
    height: 20,
    fill: "#0F1B2D"
  }), /*#__PURE__*/React.createElement("rect", {
    x: 10,
    y: 10,
    width: 10,
    height: 10,
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("rect", {
    x: 90,
    y: 0,
    width: 30,
    height: 30,
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("rect", {
    x: 95,
    y: 5,
    width: 20,
    height: 20,
    fill: "#0F1B2D"
  }), /*#__PURE__*/React.createElement("rect", {
    x: 100,
    y: 10,
    width: 10,
    height: 10,
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("rect", {
    x: 0,
    y: 90,
    width: 30,
    height: 30,
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("rect", {
    x: 5,
    y: 95,
    width: 20,
    height: 20,
    fill: "#0F1B2D"
  }), /*#__PURE__*/React.createElement("rect", {
    x: 10,
    y: 100,
    width: 10,
    height: 10,
    fill: "#fff"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 5
    }
  }, "Deposit Address"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '10px 12px',
      background: '#fff',
      border: '1px solid var(--line-2)',
      borderRadius: 6,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      flex: 1,
      fontSize: 11,
      color: 'var(--ink)',
      wordBreak: 'break-all'
    }
  }, "0x6B1c8941698Affc56757eF9Be1723Ec43F720966"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      navigator.clipboard?.writeText('0x6B1c8941698Affc56757eF9Be1723Ec43F720966');
      alert('Address copied');
    },
    style: {
      padding: '3px 8px',
      background: 'var(--acc)',
      color: '#fff',
      border: 'none',
      borderRadius: 4,
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 0.4,
      flexShrink: 0
    }
  }, "COPY")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      borderRadius: 5,
      padding: '6px 10px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: 'var(--text-3)',
      fontWeight: 700,
      letterSpacing: 0.4
    }
  }, "NETWORK"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--ink)',
      fontWeight: 700,
      marginTop: 2
    }
  }, "Ethereum (ERC-20)")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      borderRadius: 5,
      padding: '6px 10px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: 'var(--text-3)',
      fontWeight: 700,
      letterSpacing: 0.4
    }
  }, "MIN DEPOSIT"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--ink)',
      fontWeight: 700,
      marginTop: 2
    }
  }, "10 USDT")))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#FEE2E2',
      border: '1px solid #FECACA',
      borderRadius: 6,
      padding: '10px 12px',
      fontSize: 11,
      color: '#991B1B',
      marginBottom: 14,
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "warning",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", null, "USDT ERC-20 only."), " Sending other tokens or wrong network will result in lost funds."))), /*#__PURE__*/React.createElement(AmountField, {
    amount: amount,
    setAmount: setAmount,
    quick: QUICK,
    currency: "USD"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg)',
      borderRadius: 9,
      padding: '10px 12px',
      fontSize: 11.5,
      color: 'var(--text-2)'
    }
  }, /*#__PURE__*/React.createElement(Row2, {
    l: "Amount",
    v: amount ? '$' + amount : '—'
  }), /*#__PURE__*/React.createElement(Row2, {
    l: "Fee",
    v: "$0.00"
  }), /*#__PURE__*/React.createElement(Row2, {
    l: "You'll receive",
    v: amount ? '$' + amount : '—',
    bold: true
  }))), kind === 'withdraw' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SheetLabel, null, "To"), /*#__PURE__*/React.createElement(MethodGrid, {
    value: account === 'sports' ? 'wallet' : method,
    onChange: account === 'sports' ? v => setMethod('wallet') : setMethod,
    options: account === 'sports' ? [{
      v: 'wallet',
      icon: 'wallet',
      label: 'USDT Wallet',
      sub: 'Only USDT (ERC-20) accepted'
    }] : [{
      v: 'bank',
      icon: 'account_balance',
      label: 'Bank Account',
      sub: 'Enter bank details'
    }, {
      v: 'wallet',
      icon: 'wallet',
      label: 'Crypto Wallet',
      sub: 'Enter USDT (ERC-20) address'
    }]
  }), method === 'bank' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SheetLabel, null, "Your Bank Details"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg)',
      borderRadius: 9,
      padding: '12px',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 5
    }
  }, "Account Holder"), /*#__PURE__*/React.createElement("input", {
    placeholder: "Full legal name",
    style: {
      width: '100%',
      padding: '10px 12px',
      border: '1px solid var(--line-2)',
      borderRadius: 6,
      background: '#fff',
      fontSize: 13,
      outline: 'none',
      marginBottom: 10
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 5
    }
  }, "Bank Name"), /*#__PURE__*/React.createElement("input", {
    placeholder: "Your bank name",
    style: {
      width: '100%',
      padding: '8px 10px',
      border: '1px solid var(--line-2)',
      borderRadius: 6,
      background: '#fff',
      fontSize: 12,
      outline: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 5
    }
  }, "SWIFT/BIC"), /*#__PURE__*/React.createElement("input", {
    placeholder: "ABCDKRSE",
    style: {
      width: '100%',
      padding: '8px 10px',
      border: '1px solid var(--line-2)',
      borderRadius: 6,
      background: '#fff',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 11,
      outline: 'none',
      textTransform: 'uppercase'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 5
    }
  }, "Account Number / IBAN"), /*#__PURE__*/React.createElement("input", {
    placeholder: "0000-000-000000",
    style: {
      width: '100%',
      padding: '10px 12px',
      border: '1px solid var(--line-2)',
      borderRadius: 6,
      background: '#fff',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 12,
      outline: 'none'
    }
  }))), method === 'wallet' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SheetLabel, null, "Destination Wallet"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg)',
      borderRadius: 9,
      padding: '12px',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 5
    }
  }, "USDT Address (ERC-20)"), /*#__PURE__*/React.createElement("input", {
    placeholder: "0x...",
    value: wAddr,
    onChange: e => setWAddr(e.target.value),
    spellCheck: false,
    autoComplete: "off",
    style: {
      width: '100%',
      padding: '10px 12px',
      border: '1px solid var(--line-2)',
      borderRadius: 6,
      background: '#fff',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 11,
      outline: 'none',
      marginBottom: 10
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 5
    }
  }, "Network"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 10px',
      border: '1px solid var(--line-2)',
      borderRadius: 6,
      background: '#fff',
      fontSize: 12,
      color: 'var(--ink)',
      fontWeight: 600
    }
  }, "Ethereum (ERC-20)")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 5
    }
  }, "Network Fee"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 10px',
      border: '1px solid var(--line-2)',
      borderRadius: 6,
      background: '#fff',
      fontSize: 12,
      color: 'var(--ink)',
      fontWeight: 600
    }
  }, "~1.50 USDT")))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#FEE2E2',
      border: '1px solid #FECACA',
      borderRadius: 6,
      padding: '10px 12px',
      fontSize: 11,
      color: '#991B1B',
      marginBottom: 14,
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "warning",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, "Triple-check the address. Crypto withdrawals are irreversible."))), /*#__PURE__*/React.createElement(AmountField, {
    amount: amount,
    setAmount: setAmount,
    quick: [100, 500, 1000, 'MAX'],
    currency: "USD",
    max: Math.floor(fxAvail())
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg)',
      borderRadius: 9,
      padding: '10px 12px',
      fontSize: 11.5,
      color: 'var(--text-2)'
    }
  }, /*#__PURE__*/React.createElement(Row2, {
    l: "Available",
    v: '$' + fxAvail().toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }), /*#__PURE__*/React.createElement(Row2, {
    l: "Amount",
    v: amount ? '$' + amount : '—'
  }), /*#__PURE__*/React.createElement(Row2, {
    l: "Fee",
    v: "$0.00"
  }), /*#__PURE__*/React.createElement(Row2, {
    l: "You'll receive",
    v: amount ? '$' + parseFloat(amount).toFixed(2) : '—',
    bold: true
  }))), kind === 'transfer' && (() => {
    const bal = getBalances();
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SheetLabel, null, "From"), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--bg)',
        borderRadius: 9,
        padding: '10px 12px',
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 34,
        height: 34,
        borderRadius: 9,
        background: 'var(--buy)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.5
      }
    }, "FX"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        fontWeight: 700,
        color: 'var(--ink)'
      }
    }, "Alpexa FX"), /*#__PURE__*/React.createElement("div", {
      className: "mono",
      style: {
        fontSize: 10,
        color: 'var(--text-3)'
      }
    }, "#08471293 \xB7 ", fmtBalance(bal.live)))), /*#__PURE__*/React.createElement(SheetLabel, null, "To"), /*#__PURE__*/React.createElement(MethodGrid, {
      value: destAcct,
      onChange: setDestAcct,
      options: [{
        v: 'crypto',
        icon: 'currency_bitcoin',
        label: 'Alpexa Crypto',
        sub: '#21084712 · ' + fmtBalance(bal.crypto)
      }, {
        v: 'sports',
        icon: 'sports_soccer',
        label: 'Alpexa Sports',
        sub: '#44219982 · ' + fmtBalance(bal.sports)
      }]
    }), /*#__PURE__*/React.createElement(AmountField, {
      amount: amount,
      setAmount: setAmount,
      quick: QUICK,
      currency: "USD",
      max: Math.floor(fxAvail())
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--acc-3)',
        borderRadius: 9,
        padding: '10px 12px',
        fontSize: 11.5,
        color: 'var(--acc-2)',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement(Mi, {
      name: "info",
      size: 14
    }), /*#__PURE__*/React.createElement("span", null, "Instant transfer \xB7 No fees \xB7 24/7")));
  })(), kind === 'report' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SheetLabel, null, "Period"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 6,
      marginBottom: 14
    }
  }, [['monthly', 'Monthly Statement'], ['quarterly', 'Quarterly Report'], ['annual', 'Annual Tax Report'], ['custom', 'Custom Period']].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setReportType(k),
    style: {
      padding: '12px 10px',
      borderRadius: 9,
      fontSize: 12,
      fontWeight: 600,
      textAlign: 'left',
      background: reportType === k ? 'var(--acc-3)' : 'var(--bg-2)',
      color: reportType === k ? 'var(--acc-2)' : 'var(--text-2)',
      border: reportType === k ? '1px solid var(--acc)' : '1px solid transparent'
    }
  }, l))), /*#__PURE__*/React.createElement(SheetLabel, null, "Format"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginBottom: 14
    }
  }, [['pdf', 'PDF'], ['csv', 'CSV'], ['xlsx', 'Excel']].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setReportFormat(k),
    style: {
      flex: 1,
      padding: '10px 0',
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 700,
      background: reportFormat === k ? '#1B3955' : 'var(--bg-2)',
      color: reportFormat === k ? '#fff' : 'var(--text-2)'
    }
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg)',
      borderRadius: 9,
      padding: '10px 12px',
      fontSize: 11.5,
      color: 'var(--text-2)'
    }
  }, /*#__PURE__*/React.createElement(Row2, {
    l: "Type",
    v: {
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      annual: 'Annual Tax',
      custom: 'Custom'
    }[reportType]
  }), /*#__PURE__*/React.createElement(Row2, {
    l: "Format",
    v: reportFormat.toUpperCase()
  }), /*#__PURE__*/React.createElement(Row2, {
    l: "Delivery",
    v: "Sent to your account email"
  }), /*#__PURE__*/React.createElement(Row2, {
    l: "Generation time",
    v: "~30 seconds"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 16px 16px',
      background: 'var(--surface)',
      borderTop: '1px solid var(--line)'
    }
  }, err && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 7,
      padding: '9px 11px',
      marginBottom: 10,
      borderRadius: 7,
      background: 'rgba(232,74,74,0.10)',
      border: '1px solid rgba(232,74,74,0.35)',
      color: 'var(--sell)',
      fontSize: 11.5,
      fontWeight: 600,
      lineHeight: 1.4
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "error",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, err)), /*#__PURE__*/React.createElement("button", {
    onClick: submit,
    disabled: step === 'processing' || kind !== 'report' && !amount,
    style: {
      width: '100%',
      padding: '13px 0',
      borderRadius: 3,
      fontSize: 14,
      fontWeight: 700,
      color: '#fff',
      background: step === 'processing' || kind !== 'report' && !amount ? 'var(--muted)' : 'linear-gradient(180deg,#2D5478 0%,#1B3955 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      border: '1px solid ' + (step === 'processing' || kind !== 'report' && !amount ? 'var(--muted)' : '#0F2742'),
      boxShadow: step === 'processing' || kind !== 'report' && !amount ? 'none' : '0 1px 0 rgba(255,255,255,0.18) inset,0 2px 4px rgba(0,0,0,0.15)',
      textShadow: step === 'processing' || kind !== 'report' && !amount ? 'none' : '0 1px 1px rgba(0,0,0,0.15)',
      letterSpacing: 0.5
    }
  }, step === 'processing' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 16,
      height: 16,
      border: '2.5px solid rgba(255,255,255,0.35)',
      borderTopColor: '#fff',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite'
    }
  }), "Processing\u2026") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Mi, {
    name: kind === 'report' ? 'send' : kind === 'transfer' ? 'swap_horiz' : kind === 'withdraw' ? 'north' : 'south',
    size: 16
  }), kind === 'deposit' && (method === 'card' ? "I've paid" : method === 'bank' ? "I've sent the wire" : 'Confirm Deposit'), kind === 'withdraw' && 'Request Withdrawal', kind === 'transfer' && 'Transfer Now', kind === 'report' && 'Generate Report'))))));
}

// ── Funding History row + sheet ──
function fmtFundingTime(ts) {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 7 * 86400000) return Math.floor(diff / 86400000) + 'd ago';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}
function FundingRow({
  rec,
  onClick
}) {
  const KIND_META = {
    deposit: {
      icon: 'south',
      color: '#2E7D32',
      bg: '#E8F5E9',
      label: 'Deposit',
      sign: '+'
    },
    withdraw: {
      icon: 'north',
      color: '#C62828',
      bg: '#FFEBEE',
      label: 'Withdraw',
      sign: '−'
    },
    transfer: {
      icon: 'swap_horiz',
      color: '#1B3955',
      bg: '#E3F2FD',
      label: 'Transfer',
      sign: ''
    }
  };
  const m = KIND_META[rec.kind] || KIND_META.deposit;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '11px 14px',
      borderBottom: '1px solid var(--line)',
      cursor: onClick ? 'pointer' : 'default'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 8,
      background: m.bg,
      color: m.color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: m.icon,
    size: 16,
    weight: 600
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--ink)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, m.label, rec.note ? ' · ' + rec.note : ''), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 10.5,
      color: 'var(--text-3)',
      marginTop: 1
    }
  }, fmtFundingTime(rec.ts), " \xB7 ", rec.ref || rec.id)), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: m.color
    }
  }, m.sign, "$", (rec.amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: rec.status === 'completed' ? '#2E7D32' : rec.status === 'pending' ? '#F59E0B' : 'var(--text-3)',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginTop: 1
    }
  }, rec.status || 'completed')));
}
// ── Account screen ──
function Account({
  openPositions = 0,
  onNavigate
}) {
  const [sheet, setSheet] = useState(null);
  const [presetMethod, setPresetMethod] = useState(null);
  const [, force] = useState(0);
  useEffect(() => {
    try {
      const flag = localStorage.getItem('alpexa.openDeposit');
      if (flag) {
        setSheet('deposit');
        setPresetMethod(flag);
        localStorage.removeItem('alpexa.openDeposit');
      }
    } catch (e) {}
  }, []);
  useEffect(() => {
    const handler = () => force(x => x + 1);
    window.addEventListener('alpexa-leverage-change', handler);
    return () => window.removeEventListener('alpexa-leverage-change', handler);
  }, []);
  const lev = getLeverageSettings();
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      background: 'var(--bg)',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      padding: '14px 14px 10px',
      background: 'var(--bg)'
    }
  }, /*#__PURE__*/React.createElement(ActionBtn, {
    icon: "south",
    label: tr("Deposit"),
    active: sheet === 'deposit',
    onClick: () => setSheet('deposit')
  }), /*#__PURE__*/React.createElement(ActionBtn, {
    icon: "north",
    label: tr("Withdraw"),
    active: sheet === 'withdraw',
    onClick: () => setSheet('withdraw')
  }), /*#__PURE__*/React.createElement(ActionBtn, {
    icon: "swap_horiz",
    label: tr("Transfer"),
    active: sheet === 'transfer',
    onClick: () => setSheet('transfer')
  }), /*#__PURE__*/React.createElement(ActionBtn, {
    icon: "assessment",
    label: tr("Report"),
    active: sheet === 'report',
    onClick: () => setSheet('report')
  })), /*#__PURE__*/React.createElement(Section, {
    title: "Account"
  }, /*#__PURE__*/React.createElement(Row, {
    label: "Name",
    val: (() => {
      try {
        return (JSON.parse(localStorage.getItem('alpexa.me') || 'null') || {}).name || 'Account holder';
      } catch (e) {
        return 'Account holder';
      }
    })()
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Email",
    val: (() => {
      try {
        return (JSON.parse(localStorage.getItem('alpexa.me') || 'null') || {}).email || '—';
      } catch (e) {
        return '—';
      }
    })()
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Account #",
    val: (() => {
      try {
        return ((JSON.parse(localStorage.getItem('alpexa.me') || 'null') || {}).accts || {}).fx || '—';
      } catch (e) {
        return '—';
      }
    })(),
    mono: true
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Server",
    val: "alpexa-fx-04"
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Leverage",
    val: `FX 1:${lev.FX} · Stocks 1:${lev.STOCK}`,
    chev: true,
    onClick: () => setSheet('leverage')
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Currency",
    val: getPrefs().currency || 'USD',
    chev: true,
    onClick: () => setSheet('currency')
  }), /*#__PURE__*/React.createElement(Row, {
    label: tr("Language"),
    val: window.getLanguageLabel ? window.getLanguageLabel(getPrefs().language || 'en') : '🇬🇧 English',
    chev: true,
    onClick: () => setSheet('language')
  })), /*#__PURE__*/React.createElement(PammFunds, null), /*#__PURE__*/React.createElement(Section, {
    title: "Trading"
  }, /*#__PURE__*/React.createElement(Row, {
    label: "One-click Trading",
    toggle: getPrefs().oneClick,
    onToggle: v => {
      setPref('oneClick', v);
      force(x => x + 1);
    }
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Sound Effects",
    toggle: !getPrefs().soundMuted,
    onToggle: v => {
      setPref('soundMuted', !v);
      if (v && window.ALPEXA_SFX) window.ALPEXA_SFX.tick();
      force(x => x + 1);
    }
  })), /*#__PURE__*/React.createElement(Section, {
    title: "Preferences"
  }, /*#__PURE__*/React.createElement(Row, {
    label: "Price Alerts",
    val: "3 active",
    chev: true,
    onClick: () => setSheet('alerts')
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Notifications",
    chev: true,
    onClick: () => setSheet('notif')
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Dark Mode",
    toggle: document.documentElement.classList.contains('dark'),
    onToggle: v => {
      if (v) document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark');
      force(x => x + 1);
    }
  })), /*#__PURE__*/React.createElement(Section, {
    title: "Security"
  }, /*#__PURE__*/React.createElement(Row, {
    label: "2-Factor Auth",
    val: "Enabled",
    chev: true,
    onClick: () => setSheet('2fa')
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Biometric Login",
    toggle: true
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Active Sessions",
    chev: true,
    onClick: () => setSheet('sessions')
  })), /*#__PURE__*/React.createElement(Section, {
    title: "About"
  }, /*#__PURE__*/React.createElement(Row, {
    label: "Terms of Use",
    chev: true,
    onClick: () => setSheet('terms')
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Support",
    chev: true,
    onClick: () => setSheet('support')
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Version",
    val: "v1.4.2"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 12
    }
  }), sheet && ['deposit', 'withdraw', 'transfer', 'report'].includes(sheet) && /*#__PURE__*/React.createElement(AcctSheet, {
    kind: sheet,
    presetMethod: presetMethod,
    onNavigate: onNavigate,
    account: "live",
    onClose: () => {
      setSheet(null);
      setPresetMethod(null);
    }
  }), sheet === 'leverage' && /*#__PURE__*/React.createElement(LeverageSheet, {
    openPositions: openPositions,
    onClose: () => setSheet(null)
  }), sheet === 'currency' && /*#__PURE__*/React.createElement(CurrencySheet, {
    onClose: () => setSheet(null)
  }), sheet === 'language' && /*#__PURE__*/React.createElement(LanguageSheet, {
    onClose: () => setSheet(null)
  }), sheet && ['alerts', 'notif', '2fa', 'sessions', 'terms', 'support'].includes(sheet) && /*#__PURE__*/React.createElement(SettingSheet, {
    kind: sheet,
    onClose: () => setSheet(null)
  }));
}

// ── LotsPopover ──
function LotsPopover({
  lots,
  setLots,
  cls = 'FX',
  onClose
}) {
  const isInt = cls === 'STOCK' || cls === 'INDEX';
  const step = isInt ? lots < 10 ? 1 : lots < 100 ? 5 : 10 : lots < 0.1 ? 0.01 : lots < 1 ? 0.1 : 1;
  const min = isInt ? 1 : 0.01;
  const presets = isInt ? [1, 5, 10, 50, 100] : [0.01, 0.10, 0.50, 1.00, 5.00];
  const fmtVal = v => ALPEXA_MARKET.fmtVol(cls, v);
  const unit = ALPEXA_MARKET.getUnitLabel(cls).toUpperCase();
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 90,
      background: 'transparent'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 'calc(100% + 8px)',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 100,
      background: 'var(--surface)',
      borderRadius: 12,
      boxShadow: 'var(--shadow-lg)',
      padding: '10px 10px 9px',
      border: '1px solid var(--line-2)',
      width: 220
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      marginBottom: 7,
      textAlign: 'center'
    }
  }, "VOLUME (", unit, ")"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setLots(Math.max(min, +(lots - step).toFixed(2))),
    style: {
      width: 32,
      height: 32,
      borderRadius: 16,
      background: 'var(--bg-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--ink)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "remove",
    size: 18,
    weight: 600
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 22,
      fontWeight: 700,
      color: 'var(--ink)',
      lineHeight: 1
    }
  }, fmtVal(lots)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8.5,
      color: 'var(--text-3)',
      fontWeight: 600,
      letterSpacing: 0.3,
      marginTop: 2
    }
  }, "STEP ", fmtVal(step))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setLots(+(lots + step).toFixed(2)),
    style: {
      width: 32,
      height: 32,
      borderRadius: 16,
      background: 'var(--acc)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "add",
    size: 18,
    weight: 600
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4
    }
  }, presets.map(p => /*#__PURE__*/React.createElement("button", {
    key: p,
    onClick: () => setLots(p),
    className: "mono",
    style: {
      flex: 1,
      padding: '5px 0',
      borderRadius: 5,
      fontSize: 10.5,
      fontWeight: 600,
      background: Math.abs(lots - p) < 0.001 ? 'var(--ink)' : 'var(--bg-2)',
      color: Math.abs(lots - p) < 0.001 ? 'var(--ink-fg)' : 'var(--text-2)'
    }
  }, fmtVal(p)))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: -6,
      left: '50%',
      transform: 'translateX(-50%) rotate(45deg)',
      width: 12,
      height: 12,
      background: 'var(--surface)',
      borderRight: '1px solid var(--line-2)',
      borderBottom: '1px solid var(--line-2)'
    }
  })));
}

// ── Account switcher (3 servers) ──
const ACCOUNTS = [{
  id: 'live',
  name: 'Alpexa FX',
  url: 'fx.alpexa.com:443',
  tag: 'FX Stock',
  tags: [{
    t: 'FX',
    c: '#15A36C'
  }, {
    t: 'Stock',
    c: '#2D6CDF'
  }],
  acct: 'FX-50112847',
  type: 'Standard',
  balance: '€0.00',
  color: '#15A36C'
}, {
  id: 'crypto',
  name: 'Alpexa Crypto',
  url: 'crypto.alpexa.com:443',
  tag: 'CRYPTO',
  acct: 'BNX-2841759',
  type: 'Crypto',
  balance: '$0.00',
  color: '#F59E0B'
}, {
  id: 'sports',
  name: 'Alpexa Sports',
  url: 'sports.alpexa.com:443',
  tag: 'SPORTS',
  acct: 'SP-194820',
  type: 'Sports',
  balance: '$0.00',
  color: '#7C3AED'
}];
// Logged-in customers see their REAL account numbers (issued at signup, same as
// the back office); the hardcoded ones above are only the logged-out fallback.
try {
  const _me = JSON.parse(localStorage.getItem('alpexa.me') || 'null');
  if (_me && _me.accts) {
    const _map = {
      live: _me.accts.fx,
      crypto: _me.accts.crypto,
      sports: _me.accts.sports
    };
    ACCOUNTS.forEach(a => {
      if (_map[a.id]) a.acct = _map[a.id];
    });
  }
} catch (e) {}
function AccountSheet({
  open,
  current,
  onPick,
  onClose
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const h = () => force(x => x + 1);
    window.addEventListener('alpexa-balance-change', h);
    return () => window.removeEventListener('alpexa-balance-change', h);
  }, []);
  if (!open) return null;
  const bal = getBalances();
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 300,
      background: 'rgba(10,14,26,0.55)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      animation: 'fadeIn 0.15s ease'
    },
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: 'var(--surface)',
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingBottom: 18,
      overflow: 'hidden',
      animation: 'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      padding: '8px 0 6px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 4,
      borderRadius: 2,
      background: 'var(--line-2)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 16px 12px',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, "Switch Account"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--text-3)',
      padding: '4px 8px'
    }
  }, "Close")), ACCOUNTS.map(a => {
    const sel = current === a.id;
    return /*#__PURE__*/React.createElement("button", {
      key: a.id,
      onClick: () => {
        onPick(a.id);
        onClose();
      },
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        background: sel ? 'var(--acc-3)' : 'transparent',
        borderTop: '1px solid var(--line)',
        textAlign: 'left'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 36,
        height: 36,
        borderRadius: 10,
        background: a.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.5
      }
    }, a.id === 'live' ? /*#__PURE__*/React.createElement(Mi, {
      name: "trending_up",
      size: 20,
      weight: 600
    }) : a.id === 'crypto' ? /*#__PURE__*/React.createElement(Mi, {
      name: "currency_bitcoin",
      size: 20,
      weight: 600
    }) : /*#__PURE__*/React.createElement(Mi, {
      name: "sports_soccer",
      size: 20,
      weight: 600
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--ink)'
      }
    }, a.name), (a.tags || [{
      t: a.tag,
      c: a.color
    }]).map((g, gi) => /*#__PURE__*/React.createElement("span", {
      key: gi,
      style: {
        fontSize: 8.5,
        padding: '2px 5px',
        borderRadius: 3,
        background: g.c + '22',
        color: g.c,
        fontWeight: 800,
        letterSpacing: 0.4
      }
    }, g.t))), /*#__PURE__*/React.createElement("div", {
      className: "mono",
      style: {
        fontSize: 10.5,
        color: 'var(--text-3)',
        marginTop: 2
      }
    }, "#", a.acct, " \xB7 ", a.type, " \xB7 ", a.url)), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right'
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "mono",
      style: {
        fontSize: 12.5,
        fontWeight: 700,
        color: 'var(--ink)'
      }
    }, fmtBalance(srvBalById(a.id))), sel && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9.5,
        fontWeight: 700,
        color: 'var(--acc-2)',
        marginTop: 2,
        letterSpacing: 0.4
      }
    }, "\u25CF CONNECTED")));
  }), /*#__PURE__*/React.createElement("button", {
    style: {
      margin: '12px 16px 4px',
      padding: '12px 0',
      borderRadius: 10,
      background: 'var(--bg-2)',
      color: 'var(--ink)',
      fontSize: 13,
      fontWeight: 700,
      width: 'calc(100% - 32px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14
    }
  }, "+"), " Connect new server")));
}

// ── SymPicker ──
function SymPicker({
  market,
  sym,
  onPick
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      zIndex: 200,
      background: 'var(--surface)',
      borderTop: '1px solid var(--line)',
      borderBottom: '1px solid var(--line)',
      boxShadow: 'var(--shadow-lg)',
      maxHeight: 300,
      overflowY: 'auto'
    }
  }, alpexaTradable(market).map(m => /*#__PURE__*/React.createElement("button", {
    key: m.sym,
    onClick: () => onPick(m.sym),
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      padding: '10px 14px',
      borderBottom: '1px solid var(--line)',
      textAlign: 'left',
      background: sym === m.sym ? 'var(--acc-3)' : 'transparent'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, m.sym), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      padding: '1px 4px',
      borderRadius: 3,
      background: 'var(--bg-2)',
      color: 'var(--text-2)',
      fontWeight: 700
    }
  }, m.cls)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 12,
      color: 'var(--ink)',
      marginRight: 8
    }
  }, ALPEXA_MARKET.fmt(m.last, m.digits)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 11,
      fontWeight: 600,
      width: 48,
      textAlign: 'right',
      color: m.chgPct >= 0 ? '#2E6FB0' : '#E04141'
    }
  }, m.chgPct >= 0 ? '+' : '', m.chgPct.toFixed(2), "%"))));
}

// ── ChartScreen ──
function ChartScreen({
  market,
  sym,
  setSym,
  accent,
  density,
  indicators,
  setIndicators,
  lots,
  setLots,
  onPlace
}) {
  const [tf, setTf] = useState(() => {
    try {
      return localStorage.getItem('alpexa.tf') || 'M1';
    } catch (e) {
      return 'M1';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('alpexa.tf', tf);
    } catch (e) {}
  }, [tf]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lotPop, setLotPop] = useState(false);
  const [dateRangePop, setDateRangePop] = useState(false);
  const [pendingTrade, setPendingTrade] = useState(null);
  const s = market.find(m => m.sym === sym);
  function placeTrade(side, price) {
    const order = {
      sym: s.sym,
      side,
      vol: lots,
      open: price,
      sl: 0,
      tp: 0,
      otype: 'MARKET',
      swap: 0
    };
    const oneClick = typeof window.getPrefs === 'function' && window.getPrefs().oneClick;
    if (oneClick) {
      onPlace && onPlace(order);
    } else {
      setPendingTrade(order);
    }
  }
  useEffect(() => {
    if (!s) return;
    if ((s.cls === 'STOCK' || s.cls === 'INDEX') && lots < 1) setLots(1);
    // Crypto: keep the size within a sane USD range (resize to ~$500 if the
    // current quantity would be worth too little or way too much for the coin).
    else if (s.cls === 'CRYPTO') {
      const px = s.last || s.bid || 1;
      const notl = lots * px;
      if (notl < 10 || notl > 100000) setLots(+(500 / px).toFixed(6));
    }
  }, [s && s.cls, s && s.sym]);
  const ask = ALPEXA_MARKET.fxAskPx(s); // dealt ask (display lockstep)
  const up = s.chgPct >= 0;
  const cur = s.series[s.series.length - 1];
  const dPts = ((s.last - cur.o) * Math.pow(10, s.digits)).toFixed(0);
  const flashClass = s.flash === 'up' ? 'flash-up' : s.flash === 'down' ? 'flash-down' : '';
  const compact = density === 'compact';
  // MT5 colors — applied as overrides; layout/padding kept identical to original.
  const MT5_NAVY = '#1B3955',
    MT5_BID = '#E04141',
    MT5_ASK = '#2E6FB0',
    MT5_BIDTINT = 'rgba(224,65,65,0.16)',
    MT5_ASKTINT = 'rgba(46,111,176,0.16)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "chart-hdr",
    style: {
      background: MT5_NAVY,
      padding: '44px 14px 8px',
      borderBottom: '1px solid var(--line)',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setPickerOpen(!pickerOpen),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 8px 4px 4px',
      borderRadius: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 19,
      fontWeight: 800,
      color: '#fff',
      letterSpacing: 0.3
    }
  }, s.sym), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 8.5,
      padding: '2px 5px',
      borderRadius: 3,
      background: 'rgba(255,255,255,0.12)',
      color: '#A9C4DE',
      fontWeight: 700,
      letterSpacing: 0.5
    }
  }, s.cls), /*#__PURE__*/React.createElement(Mi, {
    name: "expand_more",
    size: 18,
    style: {
      color: '#A9C4DE',
      transform: pickerOpen ? 'rotate(180deg)' : 'none',
      transition: 'transform 0.15s'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "livedot"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: '#A9C4DE',
      letterSpacing: 0.4
    }
  }, "LIVE")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 10,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: `mono ${flashClass}`,
    style: {
      fontSize: 30,
      fontWeight: 700,
      color: '#fff',
      letterSpacing: -0.5,
      padding: '0 4px',
      borderRadius: 4,
      marginLeft: -4
    }
  }, ALPEXA_MARKET.fmt(s.last, s.digits)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 12.5,
      fontWeight: 700,
      color: up ? '#4ADE80' : '#FB7185'
    }
  }, up ? '+' : '', s.chgPct.toFixed(2), "%"), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 11,
      color: '#A9C4DE'
    }
  }, "(", dPts > 0 ? '+' : '', dPts, " pt)")), pickerOpen && /*#__PURE__*/React.createElement(SymPicker, {
    market: market,
    sym: sym,
    onPick: s => {
      setSym(s);
      setPickerOpen(false);
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'stretch',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      padding: '8px 14px',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: flashClass,
    style: {
      flex: 1,
      padding: '7px 10px',
      borderRadius: 3,
      background: MT5_BIDTINT,
      border: '1px solid ' + MT5_BID + '22'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8.5,
      fontWeight: 800,
      color: MT5_BID,
      letterSpacing: 0.8
    }
  }, "SELL \xB7 BID"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: MT5_BID,
      marginTop: 2
    }
  }, ALPEXA_MARKET.fmt(s.last, s.digits))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8.5,
      color: 'var(--text-3)',
      fontWeight: 700,
      letterSpacing: 0.4
    }
  }, "SPREAD"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--ink)',
      marginTop: 2
    }
  }, ((ALPEXA_MARKET.fxAskPx(s) - ALPEXA_MARKET.fxBidPx(s)) * Math.pow(10, s.digits)).toFixed(0))), /*#__PURE__*/React.createElement("div", {
    className: flashClass,
    style: {
      flex: 1,
      padding: '7px 10px',
      borderRadius: 3,
      background: MT5_ASKTINT,
      border: '1px solid ' + MT5_ASK + '22'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8.5,
      fontWeight: 800,
      color: MT5_ASK,
      letterSpacing: 0.8,
      textAlign: 'right'
    }
  }, "BUY \xB7 ASK"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: MT5_ASK,
      marginTop: 2,
      textAlign: 'right'
    }
  }, ALPEXA_MARKET.fmt(ask, s.digits)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 2,
      padding: '6px 8px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      alignItems: 'center'
    }
  }, ['M1', 'M5', 'M15', 'H1', 'H4', 'D1', 'W1'].map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    onClick: () => setTf(t),
    style: {
      flex: 1,
      padding: '6px 0',
      borderRadius: 6,
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: 0.3,
      background: tf === t ? 'var(--ink)' : 'transparent',
      color: tf === t ? 'var(--ink-fg)' : 'var(--text-2)'
    }
  }, t)), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: 18,
      background: 'var(--line-2)',
      margin: '0 4px'
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setDateRangePop(!dateRangePop),
    style: {
      width: 30,
      height: 28,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: dateRangePop ? 'var(--acc)' : 'var(--text-2)',
      position: 'relative',
      background: dateRangePop ? 'var(--acc-3)' : 'transparent',
      borderRadius: 6
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "date_range",
    size: 16
  }), dateRangePop && /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      top: 'calc(100% + 6px)',
      right: 0,
      zIndex: 50,
      background: 'var(--surface)',
      borderRadius: 10,
      boxShadow: 'var(--shadow-lg)',
      border: '1px solid var(--line-2)',
      padding: '8px',
      width: 200,
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      padding: '2px 6px 6px'
    }
  }, "JUMP TO"), [['1H', 'Last 1 hour', 'M1'], ['1D', 'Last 24 hours', 'M15'], ['1W', 'Last week', 'H1'], ['1M', 'Last month', 'H4'], ['3M', 'Last 3 months', 'D1'], ['YTD', 'Year to date', 'D1'], ['ALL', 'All available', 'W1']].map(([k, l, mappedTf]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: e => {
      e.stopPropagation();
      setTf(mappedTf);
      setDateRangePop(false);
    },
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '7px 8px',
      borderRadius: 6,
      fontSize: 12,
      color: tf === mappedTf ? 'var(--acc-2)' : 'var(--ink)',
      background: tf === mappedTf ? 'var(--acc-3)' : 'transparent',
      textAlign: 'left'
    },
    onMouseEnter: e => {
      if (tf !== mappedTf) e.currentTarget.style.background = 'var(--bg)';
    },
    onMouseLeave: e => {
      if (tf !== mappedTf) e.currentTarget.style.background = 'transparent';
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 10.5,
      fontWeight: 700,
      color: 'var(--acc-2)',
      width: 30
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-2)',
      flex: 1
    }
  }, l), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 9.5,
      color: 'var(--text-3)',
      fontWeight: 700
    }
  }, mappedTf)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      padding: '7px 14px',
      background: 'var(--bg-2)',
      borderBottom: '1px solid var(--line)',
      fontSize: 10
    }
  }, [['O', cur.o], ['H', s.high], ['L', s.low], ['C', s.last]].map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      display: 'flex',
      gap: 4,
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      fontWeight: 700,
      fontSize: 9
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      color: 'var(--ink)',
      fontWeight: 600
    }
  }, ALPEXA_MARKET.fmt(v, s.digits))))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      position: 'relative',
      background: 'var(--surface)',
      minHeight: 0,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Chart, {
    series: s.series,
    sym: s.sym,
    tf: tf,
    digits: s.digits,
    showMA: indicators.ma,
    showVol: indicators.vol,
    showBB: indicators.bb,
    showRSI: indicators.rsi,
    showMACD: indicators.macd,
    accent: accent,
    height: compact ? 260 : 300,
    fillContainer: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      padding: '7px 12px',
      background: 'var(--surface)',
      borderTop: '1px solid var(--line)',
      overflowX: 'auto'
    }
  }, [['ma', 'MA(20)'], ['vol', 'Volume'], ['bb', 'Bollinger'], ['rsi', 'RSI(14)'], ['macd', 'MACD']].map(([k, l]) => {
    const on = indicators[k];
    return /*#__PURE__*/React.createElement("button", {
      key: k,
      onClick: () => setIndicators({
        ...indicators,
        [k]: !on
      }),
      style: {
        flexShrink: 0,
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 600,
        background: on ? 'var(--acc-3)' : 'var(--bg-2)',
        color: on ? 'var(--acc-ink)' : 'var(--text-3)',
        border: on ? '1px solid var(--acc)' : '1px solid transparent'
      }
    }, on ? '● ' : '', l);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      padding: '10px 10px',
      background: 'var(--surface)',
      borderTop: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (!onPlace) return;
      placeTrade('SELL', s.last);
    },
    style: {
      flex: 1,
      padding: '14px 0',
      borderRadius: 4,
      background: 'linear-gradient(180deg,#E84A4A 0%,#C92F2F 100%)',
      color: '#fff',
      fontWeight: 800,
      fontSize: 14,
      letterSpacing: 0.5,
      lineHeight: 1.2,
      border: '1px solid #A82424',
      boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset,0 2px 4px rgba(192,30,30,0.35)',
      textShadow: '0 1px 1px rgba(0,0,0,0.15)'
    }
  }, "SELL", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 11.5,
      fontWeight: 600,
      opacity: 0.95
    }
  }, ALPEXA_MARKET.fmt(s.last, s.digits))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setLotPop(!lotPop),
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: 78,
      background: lotPop ? 'var(--surface)' : 'var(--bg-2)',
      borderRadius: 4,
      padding: '4px 0',
      border: lotPop ? '1px solid var(--acc)' : '1px solid var(--line-2)',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 8.5,
      color: 'var(--text-3)',
      fontWeight: 700,
      letterSpacing: 0.4
    }
  }, ALPEXA_MARKET.getUnitLabel(s.cls).toUpperCase()), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: 'var(--ink)',
      lineHeight: 1.1,
      marginTop: 1
    }
  }, ALPEXA_MARKET.fmtVol(s.cls, lots))), lotPop && /*#__PURE__*/React.createElement(LotsPopover, {
    lots: lots,
    setLots: setLots,
    cls: s.cls,
    onClose: () => setLotPop(false)
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (!onPlace) return;
      placeTrade('BUY', ask);
    },
    style: {
      flex: 1,
      padding: '14px 0',
      borderRadius: 4,
      background: 'linear-gradient(180deg,#3A7CC0 0%,#1F5A95 100%)',
      color: '#fff',
      fontWeight: 800,
      fontSize: 14,
      letterSpacing: 0.5,
      lineHeight: 1.2,
      border: '1px solid #194B7F',
      boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset,0 2px 4px rgba(31,90,149,0.35)',
      textShadow: '0 1px 1px rgba(0,0,0,0.15)'
    }
  }, "BUY", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 11.5,
      fontWeight: 600,
      opacity: 0.95
    }
  }, ALPEXA_MARKET.fmt(ask, s.digits)))), pendingTrade && (() => {
    const pSideCol = pendingTrade.side === 'BUY' ? '#2E6FB0' : '#E04141';
    const pSideColDarker = pendingTrade.side === 'BUY' ? '#194B7F' : '#A82424';
    const pSideGrad = pendingTrade.side === 'BUY' ? 'linear-gradient(180deg,#3A7CC0 0%,#1F5A95 100%)' : 'linear-gradient(180deg,#E84A4A 0%,#C92F2F 100%)';
    return /*#__PURE__*/React.createElement("div", {
      onClick: () => setPendingTrade(null),
      style: {
        position: 'absolute',
        inset: 0,
        background: 'rgba(10,14,26,0.55)',
        zIndex: 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }
    }, /*#__PURE__*/React.createElement("div", {
      onClick: e => e.stopPropagation(),
      style: {
        background: 'var(--surface)',
        borderRadius: 4,
        padding: 0,
        width: '100%',
        maxWidth: 320,
        animation: 'popIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        border: '1px solid var(--line-2)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: pSideCol,
        color: '#fff',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: '1px solid ' + pSideColDarker
      }
    }, /*#__PURE__*/React.createElement(Mi, {
      name: pendingTrade.side === 'BUY' ? 'arrow_upward' : 'arrow_downward',
      size: 16,
      weight: 700
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: 0.5,
        flex: 1
      }
    }, pendingTrade.side, " ORDER \xB7 ", pendingTrade.sym), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 6px',
        background: 'rgba(255,255,255,0.18)',
        borderRadius: 2,
        letterSpacing: 0.4
      }
    }, "MARKET")), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '14px 16px 16px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: 'var(--text-3)',
        marginBottom: 10,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: 'uppercase'
      }
    }, "Order details"), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--bg)',
        borderRadius: 3,
        padding: '8px 12px',
        marginBottom: 14,
        fontSize: 12.5,
        border: '1px solid var(--line-2)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '4px 0',
        color: 'var(--text-2)'
      }
    }, /*#__PURE__*/React.createElement("span", null, "Volume"), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, ALPEXA_MARKET.fmtVol(s.cls, pendingTrade.vol), " ", ALPEXA_MARKET.getUnitLabel(s.cls))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '4px 0',
        color: 'var(--text-2)'
      }
    }, /*#__PURE__*/React.createElement("span", null, "Entry price"), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, ALPEXA_MARKET.fmt(pendingTrade.open, s.digits)))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setPendingTrade(null),
      style: {
        flex: 1,
        padding: '11px 0',
        borderRadius: 3,
        background: 'var(--bg-2)',
        fontSize: 12.5,
        fontWeight: 600,
        color: 'var(--text-2)',
        border: '1px solid var(--line-2)'
      }
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        onPlace && onPlace(pendingTrade);
        setPendingTrade(null);
      },
      style: {
        flex: 1.4,
        padding: '11px 0',
        borderRadius: 3,
        background: pSideGrad,
        fontSize: 12.5,
        fontWeight: 800,
        color: '#fff',
        letterSpacing: 0.5,
        border: '1px solid ' + pSideColDarker,
        boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset,0 2px 4px rgba(0,0,0,0.15)',
        textShadow: '0 1px 1px rgba(0,0,0,0.15)'
      }
    }, "Confirm ", pendingTrade.side)))));
  })());
}

// ── AppHeader ──
function AppHeader({
  accent,
  account,
  onAccountClick,
  livePnl = 0,
  prevPnl = 0,
  usedMargin = 0,
  notifCount = 0,
  onBellClick,
  onMenuClick,
  tab
}) {
  const [, forceBal] = useState(0);
  useEffect(() => {
    const h = () => forceBal(x => x + 1);
    window.addEventListener('alpexa-balance-change', h);
    window.addEventListener('alpexa-leverage-change', h);
    return () => {
      window.removeEventListener('alpexa-balance-change', h);
      window.removeEventListener('alpexa-leverage-change', h);
    };
  }, []);
  const a = ACCOUNTS.find(x => x.id === account) || ACCOUNTS[0];
  const balanceNum = getBalances()[a.id] || 0;
  const prefs = getPrefs();
  const cur = window.getCurrency ? window.getCurrency(prefs.currency || 'USD') : {
    code: 'USD',
    symbol: '$',
    rate: 1
  };
  const equityUsd = balanceNum + livePnl;
  const freeUsd = balanceNum + livePnl - usedMargin;
  // Publish FX equity + free margin so the Crypto app (server dropdown / Accounts /
  // withdraw / transfer) can show EQUITY instead of raw balance — otherwise a user
  // with floating losses could withdraw/transfer money that isn't really there.
  useEffect(() => {
    try {
      if (a.id === 'live') {
        localStorage.setItem('alpexa.fxEquity', String(equityUsd));
        localStorage.setItem('alpexa.fxFree', String(Math.max(0, freeUsd)));
      }
    } catch (e) {}
  }, [equityUsd, freeUsd, a.id]);
  const equity = equityUsd * cur.rate;
  const balance = balanceNum * cur.rate;
  const free = freeUsd * cur.rate;
  const pnlConverted = livePnl * cur.rate;
  // Treat negligible used margin (no real open positions) as no margin in use,
  // so the level shows "—" instead of an absurd number from floating-point dust.
  const marginLevel = usedMargin >= 0.01 ? equityUsd / usedMargin * 100 : Infinity;
  const MARGIN_CALL = 100;
  const STOP_OUT = 50;
  const SAFE_THRESHOLD = 500;
  const marginColor = marginLevel < STOP_OUT ? '#FB7185' : marginLevel < MARGIN_CALL ? '#F59E0B' : marginLevel < 200 ? '#FBBF24' : marginLevel >= SAFE_THRESHOLD ? '#86EFAC' : 'rgba(255,255,255,0.92)';
  const marginWarn = marginLevel < MARGIN_CALL;
  const marginDisplay = marginLevel === Infinity ? '—' : Math.round(marginLevel).toLocaleString('en-US') + '%';
  const up = livePnl >= 0;
  const flashClass = livePnl > prevPnl ? 'flash-up' : livePnl < prevPnl ? 'flash-down' : '';
  const decimals = cur.code === 'JPY' || cur.code === 'KRW' ? 0 : 2;
  const fmtN = n => n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "app-hdr",
    style: {
      background: 'linear-gradient(180deg,#1A3A57,#122A41)',
      color: '#fff',
      padding: '44px 14px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginRight: -6,
      marginBottom: -2
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: '#6E8CA8',
      letterSpacing: 0.8,
      textTransform: 'uppercase'
    }
  }, tr('Equity'), " \xB7 ", cur.code), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onAccountClick,
    "aria-label": "Switch server",
    title: "Switch server",
    style: {
      padding: 6,
      background: 'none',
      border: 'none',
      color: 'rgba(255,255,255,0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "4",
    width: "18",
    height: "6",
    rx: "1.5"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "14",
    width: "18",
    height: "6",
    rx: "1.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "7",
    r: "0.6",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "17",
    r: "0.6",
    fill: "currentColor"
  }))), /*#__PURE__*/React.createElement("button", {
    onClick: onBellClick,
    style: {
      padding: 6,
      color: 'rgba(255,255,255,0.85)',
      position: 'relative'
    }
  }, ScreenIcons.bell, notifCount > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 2,
      right: 2,
      minWidth: 14,
      height: 14,
      padding: '0 3px',
      borderRadius: 7,
      background: '#FB7185',
      color: '#fff',
      fontSize: 9,
      fontWeight: 800,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: 1,
      border: '1.5px solid #16304A'
    }
  }, notifCount > 9 ? '9+' : notifCount)), /*#__PURE__*/React.createElement("button", {
    onClick: onMenuClick,
    style: {
      padding: 6,
      color: 'rgba(255,255,255,0.85)'
    }
  }, ScreenIcons.menu))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      marginTop: -1
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: `mono ${flashClass}`,
    style: {
      fontSize: 27,
      fontWeight: 700,
      lineHeight: 1.05,
      letterSpacing: -0.5,
      whiteSpace: 'nowrap'
    }
  }, cur.symbol, fmtN(equity))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      rowGap: 5,
      columnGap: 14,
      marginTop: 10,
      paddingTop: 9,
      borderTop: '1px solid rgba(255,255,255,0.10)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 6,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: '#6E8CA8',
      fontWeight: 600,
      letterSpacing: 0.6,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, tr('Balance')), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 13,
      color: '#EAF0F6',
      fontWeight: 500,
      whiteSpace: 'nowrap',
      flexShrink: 0
    }
  }, cur.symbol, fmtN(balance))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 6,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: '#6E8CA8',
      fontWeight: 600,
      letterSpacing: 0.6,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, tr('Free margin')), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 13,
      color: '#EAF0F6',
      fontWeight: 500,
      whiteSpace: 'nowrap',
      flexShrink: 0
    }
  }, cur.symbol, fmtN(free))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 6,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: '#6E8CA8',
      fontWeight: 600,
      letterSpacing: 0.6,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, tr('Margin')), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 13,
      color: usedMargin > 0 ? '#F4C24B' : 'rgba(255,255,255,0.55)',
      fontWeight: 500,
      whiteSpace: 'nowrap',
      flexShrink: 0
    }
  }, cur.symbol, fmtN(usedMargin * cur.rate))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 6,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: '#6E8CA8',
      fontWeight: 600,
      letterSpacing: 0.6,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, "P/L"), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 13,
      color: up ? '#4ADE80' : '#FB7185',
      fontWeight: 600,
      whiteSpace: 'nowrap',
      flexShrink: 0
    }
  }, (pnlConverted >= 0 ? '+' : '-') + cur.symbol + fmtN(Math.abs(pnlConverted))))), marginLevel < 500 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      paddingTop: 8,
      borderTop: '1px solid rgba(255,255,255,0.10)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: marginColor,
      fontWeight: 700,
      letterSpacing: 0.6,
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      textTransform: 'uppercase'
    }
  }, marginWarn && /*#__PURE__*/React.createElement(Mi, {
    name: "warning",
    size: 12,
    style: {
      color: marginColor
    }
  }), tr('Margin level')), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 13,
      color: marginColor,
      fontWeight: 700
    }
  }, marginDisplay)));
}

// ── BottomNav ──
function BottomNav({
  tab,
  setTab
}) {
  const items = [['WATCH', 'Watch'], ['CHART', 'Chart'], ['TRADE', 'Trade'], ['HIST', 'History'], ['ACCT', 'Account']];
  const TAB_ICONS = {
    WATCH: /*#__PURE__*/React.createElement(Mi, {
      name: "format_list_bulleted",
      size: 22
    }),
    CHART: /*#__PURE__*/React.createElement(Mi, {
      name: "candlestick_chart",
      size: 22
    }),
    TRADE: /*#__PURE__*/React.createElement(Mi, {
      name: "swap_vert",
      size: 22
    }),
    HIST: /*#__PURE__*/React.createElement(Mi, {
      name: "history",
      size: 22
    }),
    ACCT: /*#__PURE__*/React.createElement(Mi, {
      name: "account_circle",
      size: 22
    })
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "bottom-nav",
    style: {
      display: 'flex',
      background: 'var(--surface)',
      borderTop: '1px solid var(--line)',
      padding: '5px 4px 30px'
    }
  }, items.map(([k, l]) => {
    const active = tab === k;
    return /*#__PURE__*/React.createElement("button", {
      key: k,
      onClick: () => setTab(k),
      style: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '4px 0',
        color: active ? 'var(--ink)' : 'var(--text-3)'
      }
    }, TAB_ICONS[k], /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        fontWeight: active ? 700 : 500,
        letterSpacing: 0.3
      }
    }, tr(l)));
  }));
}

// ── AppMenu ──
function MenuItem({
  icon,
  label,
  sub,
  toggle,
  chev,
  danger,
  onClick
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 12px',
      borderRadius: 9,
      cursor: 'pointer'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'var(--bg)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent'
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 8,
      flexShrink: 0,
      background: danger ? 'rgba(224,65,65,0.16)' : '#E8EDF3',
      color: danger ? '#E04141' : '#1B3955',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: icon,
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: danger ? '#E04141' : 'var(--ink)'
    }
  }, label), sub && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-3)',
      marginTop: 1
    }
  }, sub)), toggle !== undefined && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 22,
      borderRadius: 11,
      position: 'relative',
      background: toggle ? '#1B3955' : 'var(--muted)',
      transition: 'background 0.2s',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 18,
      height: 18,
      background: '#fff',
      borderRadius: 9,
      position: 'absolute',
      top: 2,
      left: toggle ? 16 : 2,
      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      transition: 'left 0.2s'
    }
  })), chev && /*#__PURE__*/React.createElement(Mi, {
    name: "chevron_right",
    size: 16,
    style: {
      color: 'var(--text-3)'
    }
  }));
}
function StatCard({
  lbl,
  val,
  up,
  hue
}) {
  const color = hue === 'buy' ? 'var(--buy)' : hue === 'sell' ? 'var(--sell)' : up !== undefined ? up ? 'var(--buy)' : 'var(--sell)' : 'var(--ink)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg)',
      borderRadius: 9,
      padding: '10px 12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5
    }
  }, lbl), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 18,
      fontWeight: 700,
      color,
      marginTop: 3,
      letterSpacing: -0.2
    }
  }, val));
}
function AppMenu({
  indicators,
  setIndicators,
  liveOrders,
  closedHistory,
  onClose
}) {
  const [view, setView] = useState('root');
  function muted() {
    try {
      return JSON.parse(localStorage.getItem('alpexa.prefs') || '{}').soundMuted === true;
    } catch (e) {
      return false;
    }
  }
  const [, force] = useState(0);
  function toggleSound() {
    try {
      const p = JSON.parse(localStorage.getItem('alpexa.prefs') || '{}');
      p.soundMuted = !p.soundMuted;
      localStorage.setItem('alpexa.prefs', JSON.stringify(p));
      if (!p.soundMuted && window.ALPEXA_SFX) window.ALPEXA_SFX.tick();
    } catch (e) {}
    force(x => x + 1);
  }
  function toggleDark() {
    document.documentElement.classList.toggle('dark');
    force(x => x + 1);
  }
  // Combine this session's closed trades with the preset demo history so the
  // Trading Statistics screen always shows meaningful numbers.
  const closed = [...(closedHistory || [])];
  const wins = closed.filter(c => c.pnl >= 0);
  const losses = closed.filter(c => c.pnl < 0);
  const winRate = closed.length ? (wins.length / closed.length * 100).toFixed(1) : '0.0';
  const totalPnl = closed.reduce((s, c) => s + (c.pnl || 0), 0);
  const avgWin = wins.length ? wins.reduce((s, c) => s + c.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, c) => s + c.pnl, 0) / losses.length : 0;
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-sheet-overlay",
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(10,14,26,0.55)',
      zIndex: 300,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: 'var(--surface)',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      display: 'flex',
      flexDirection: 'column',
      maxHeight: '80%',
      overflow: 'hidden',
      animation: 'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#1B3955',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: '10px 16px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, view !== 'root' && /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('root'),
    style: {
      width: 28,
      height: 28,
      borderRadius: 14,
      background: 'rgba(255,255,255,0.1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "arrow_back",
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: '#fff',
      letterSpacing: 0.4,
      textTransform: 'uppercase'
    }
  }, view === 'root' && 'Settings', view === 'chart' && 'Chart Settings', view === 'stats' && 'Trading Statistics', view === 'help' && 'Help & FAQ'), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 28,
      height: 28,
      borderRadius: 14,
      background: 'rgba(255,255,255,0.1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "close",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '0 12px 16px'
    }
  }, view === 'root' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(MenuItem, {
    icon: "tune",
    label: "Chart Settings",
    sub: "Indicators, grid, colors",
    onClick: () => setView('chart')
  }), /*#__PURE__*/React.createElement(MenuItem, {
    icon: "dark_mode",
    label: "Dark Mode",
    toggle: document.documentElement.classList.contains('dark'),
    onClick: toggleDark
  }), /*#__PURE__*/React.createElement(MenuItem, {
    icon: muted() ? 'volume_off' : 'volume_up',
    label: "Sound",
    toggle: !muted(),
    onClick: toggleSound
  }), /*#__PURE__*/React.createElement(MenuItem, {
    icon: "bar_chart",
    label: "Trading Statistics",
    sub: `${closed.length} closed · ${winRate}% win rate`,
    onClick: () => setView('stats')
  }), /*#__PURE__*/React.createElement(MenuItem, {
    icon: "help_outline",
    label: "Help & FAQ",
    sub: "Get answers fast",
    onClick: () => setView('help')
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 6,
      marginTop: 8,
      borderTop: '1px solid var(--line)'
    }
  }), /*#__PURE__*/React.createElement(MenuItem, {
    icon: "logout",
    label: "Sign Out",
    danger: true,
    onClick: () => {
      if (!confirm('Sign out of ALPEXA?')) return;
      try {
        if (window.AlpexaSync && AlpexaSync.db && AlpexaSync.db.auth) AlpexaSync.db.auth.signOut();
      } catch (e) {}
      try {
        ['alpexa.me', 'alpexa.userName', 'alpexa.userEmail'].forEach(function (k) {
          localStorage.removeItem(k);
        });
      } catch (e) {}
      try {
        window.location.replace('login.html?switch=1');
      } catch (e) {
        window.location.href = 'login.html?switch=1';
      }
    }
  })), view === 'chart' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      margin: '4px 4px 8px'
    }
  }, "INDICATORS"), [['ma', 'MA(20) — Moving Average', 'show_chart'], ['vol', 'Volume', 'equalizer'], ['bb', 'Bollinger Bands', 'signal_cellular_alt'], ['rsi', 'RSI(14) — Relative Strength', 'speed'], ['macd', 'MACD', 'timeline']].map(([k, l, ic]) => /*#__PURE__*/React.createElement(MenuItem, {
    key: k,
    icon: ic,
    label: l,
    toggle: !!indicators[k],
    onClick: () => setIndicators({
      ...indicators,
      [k]: !indicators[k]
    })
  }))), view === 'stats' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    lbl: "Total P/L",
    val: `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`,
    up: totalPnl >= 0
  }), /*#__PURE__*/React.createElement(StatCard, {
    lbl: "Win Rate",
    val: `${winRate}%`
  }), /*#__PURE__*/React.createElement(StatCard, {
    lbl: "Wins",
    val: wins.length,
    hue: "buy"
  }), /*#__PURE__*/React.createElement(StatCard, {
    lbl: "Losses",
    val: losses.length,
    hue: "sell"
  }), /*#__PURE__*/React.createElement(StatCard, {
    lbl: "Avg Win",
    val: `+$${avgWin.toFixed(2)}`,
    hue: "buy"
  }), /*#__PURE__*/React.createElement(StatCard, {
    lbl: "Avg Loss",
    val: `$${avgLoss.toFixed(2)}`,
    hue: "sell"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg)',
      borderRadius: 9,
      padding: '12px 14px',
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--text-2)',
      marginBottom: 8
    }
  }, "Active Positions"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 12.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)'
    }
  }, "Open"), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, (liveOrders || []).length)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 12.5,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)'
    }
  }, "Closed (session)"), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, closed.length)))), view === 'help' && /*#__PURE__*/React.createElement(React.Fragment, null, [{
    q: 'How do I place a trade?',
    a: 'Tap a symbol in Watchlist or go to Chart, set volume, then BUY or SELL.'
  }, {
    q: 'What is leverage?',
    a: 'A multiplier on your buying power. Configure in Account → Leverage Settings.'
  }, {
    q: 'How are spreads charged?',
    a: 'Spreads are floating. You pay the difference between bid and ask on entry.'
  }, {
    q: 'Can I close partial?',
    a: 'Not yet — full close only. Modify SL/TP to manage risk on open positions.'
  }, {
    q: 'When are markets open?',
    a: 'FX: 24/5 (Sun 21:00 GMT — Fri 21:00 GMT). Stocks: NYSE 14:30–21:00 GMT. Crypto: 24/7.'
  }].map((item, i) => /*#__PURE__*/React.createElement("details", {
    key: i,
    style: {
      background: 'var(--bg)',
      borderRadius: 9,
      padding: '10px 12px',
      marginBottom: 5,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("summary", {
    style: {
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--ink)',
      cursor: 'pointer'
    }
  }, item.q), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-2)',
      marginTop: 6,
      lineHeight: 1.5
    }
  }, item.a))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      fontSize: 11,
      color: 'var(--text-3)',
      marginTop: 12
    }
  }, "ALPEXA SUISSE v1.4.2 \xB7 \xA9 2026")))));
}

// ── NotificationSheet ──
function NotificationSheet({
  notifications,
  setNotifications,
  onClose
}) {
  const unread = notifications.filter(n => !n.read).length;
  function markAllRead() {
    setNotifications(notifications.map(n => ({
      ...n,
      read: true
    })));
  }
  function clear(id) {
    setNotifications(notifications.filter(n => n.id !== id));
  }
  function markRead(id) {
    setNotifications(notifications.map(n => n.id === id ? {
      ...n,
      read: true
    } : n));
  }
  const META = {
    orderFill: {
      icon: 'task_alt',
      tint: 'var(--buy-tint)',
      col: 'var(--buy-2)',
      label: 'Order Filled'
    },
    pendingTriggered: {
      icon: 'bolt',
      tint: '#FFF3E0',
      col: '#E65100',
      label: 'Pending Triggered'
    },
    priceAlert: {
      icon: 'notifications_active',
      tint: 'var(--acc-3)',
      col: 'var(--acc-2)',
      label: 'Price Alert'
    },
    news: {
      icon: 'campaign',
      tint: '#FCE4EC',
      col: '#C2185B',
      label: 'Market News'
    },
    login: {
      icon: 'login',
      tint: 'var(--bg-2)',
      col: 'var(--text-2)',
      label: 'New Sign-in'
    },
    marginCall: {
      icon: 'warning',
      tint: 'var(--sell-tint)',
      col: 'var(--sell-2)',
      label: 'Margin Call'
    },
    deposit: {
      icon: 'south',
      tint: 'var(--buy-tint)',
      col: 'var(--buy-2)',
      label: 'Deposit'
    },
    withdraw: {
      icon: 'north',
      tint: 'var(--sell-tint)',
      col: 'var(--sell-2)',
      label: 'Withdrawal'
    },
    transfer: {
      icon: 'swap_horiz',
      tint: 'var(--acc-3)',
      col: 'var(--acc-2)',
      label: 'Transfer'
    },
    approved: {
      icon: 'check_circle',
      tint: 'var(--buy-tint)',
      col: 'var(--buy-2)',
      label: 'Approved'
    },
    rejected: {
      icon: 'cancel',
      tint: 'var(--sell-tint)',
      col: 'var(--sell-2)',
      label: 'Rejected'
    },
    marketClosed: {
      icon: 'lock',
      tint: 'var(--sell-tint)',
      col: 'var(--sell-2)',
      label: 'Market Closed'
    },
    marketOpen: {
      icon: 'lock_open',
      tint: 'var(--buy-tint)',
      col: 'var(--buy-2)',
      label: 'Market Open'
    }
  };
  function renderBody(n) {
    if (n.type === 'orderFill') return /*#__PURE__*/React.createElement(React.Fragment, null, "Filled ", /*#__PURE__*/React.createElement("b", null, n.side, " ", n.vol && n.vol.toFixed(2), " ", n.sym), " @ ", /*#__PURE__*/React.createElement("span", {
      className: "mono"
    }, n.px));
    if (n.type === 'pendingTriggered') return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("b", null, n.side, " ", n.sym), " triggered at ", /*#__PURE__*/React.createElement("span", {
      className: "mono"
    }, n.px));
    if (n.type === 'priceAlert') return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("b", null, n.sym), " crossed ", n.side === 'above' ? '↑' : '↓', " ", /*#__PURE__*/React.createElement("span", {
      className: "mono"
    }, n.px && n.px.toLocaleString()));
    if (n.type === 'news') return /*#__PURE__*/React.createElement(React.Fragment, null, n.title);
    if (n.type === 'login') return n.title ? /*#__PURE__*/React.createElement(React.Fragment, null, n.title) : /*#__PURE__*/React.createElement(React.Fragment, null, "New sign-in from ", /*#__PURE__*/React.createElement("b", null, n.device), " \xB7 ", n.loc);
    return n.title ? /*#__PURE__*/React.createElement(React.Fragment, null, n.title) : null;
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-sheet-overlay",
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(10,14,26,0.55)',
      zIndex: 300,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: 'var(--surface)',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      display: 'flex',
      flexDirection: 'column',
      maxHeight: '82%',
      overflow: 'hidden',
      animation: 'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      padding: '8px 0 4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 4,
      borderRadius: 2,
      background: 'var(--line-2)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 16px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, "Notifications"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-3)',
      marginTop: 2
    }
  }, unread > 0 ? `${unread} unread · ${notifications.length} total` : `${notifications.length} total`)), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), unread > 0 && /*#__PURE__*/React.createElement("button", {
    onClick: markAllRead,
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--acc-2)',
      padding: '5px 10px',
      borderRadius: 6,
      background: 'var(--acc-3)'
    }
  }, "Mark all read"), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 28,
      height: 28,
      borderRadius: 14,
      background: 'var(--bg-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-2)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "close",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '4px 12px 14px'
    }
  }, notifications.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '50px 16px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "notifications_off",
    size: 42,
    style: {
      color: 'var(--muted)',
      display: 'block',
      margin: '0 auto 10px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--text-2)'
    }
  }, "No notifications"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      marginTop: 4,
      color: 'var(--text-3)'
    }
  }, "You're all caught up")) : notifications.map(n => {
    const m = META[n.type] || META.login;
    return /*#__PURE__*/React.createElement("div", {
      key: n.id,
      onClick: () => markRead(n.id),
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '11px 12px',
        background: n.read ? 'transparent' : 'var(--acc-3)',
        borderRadius: 9,
        marginBottom: 4,
        cursor: 'pointer',
        borderLeft: n.read ? '3px solid transparent' : '3px solid var(--acc)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 34,
        height: 34,
        borderRadius: 8,
        flexShrink: 0,
        background: m.tint,
        color: m.col,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(Mi, {
      name: m.icon,
      size: 18
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11.5,
        fontWeight: 700,
        color: m.col,
        letterSpacing: 0.2
      }
    }, m.label), !n.read && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--acc)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 10,
        color: 'var(--text-3)'
      }
    }, n.time)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: 'var(--ink)',
        marginTop: 3,
        lineHeight: 1.4
      }
    }, renderBody(n))), /*#__PURE__*/React.createElement("button", {
      onClick: e => {
        e.stopPropagation();
        clear(n.id);
      },
      style: {
        width: 24,
        height: 24,
        borderRadius: 12,
        color: 'var(--text-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement(Mi, {
      name: "close",
      size: 14
    })));
  }))));
}

// ── App (root component) ──
const TWEAK_DEFAULTS = {
  accent: '#1565C0',
  density: 'compact',
  darkHdr: true
};
function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const urlSym = (() => {
    try {
      const p = new URLSearchParams(window.location.search).get('sym');
      const ls = localStorage.getItem('alpexa.selectedSym');
      return p || ls || 'EURUSD';
    } catch (e) {
      return 'EURUSD';
    }
  })();
  const [tab, setTab] = useState('WATCH');
  const [sym, setSym] = useState(urlSym);
  const [posTab, setPosTab] = useState('OPEN');
  const [account, _setAccount] = useState('live');
  // === Cross-app navigation: switching server redirects to the matching app ===
  const setAccount = next => {
    if (next === 'crypto') {
      window.location.href = 'crypto-live.html';
      return;
    }
    if (next === 'sports') {
      window.location.href = 'sports-live.html';
      return;
    }
    _setAccount(next); // 'live' stays in this app
  };
  // Apply back-office approvals to FX balances (pending -> approved).
  React.useEffect(() => {
    if (!window.AlpexaSync || !AlpexaSync.db) return;
    let stop = false;
    const tick = () => {
      AlpexaSync.pullMine().then(rows => {
        if (stop || !rows || !rows.length) return;
        const map = {};
        rows.forEach(r => {
          map[r.local_id] = r;
        });
        const hist = window.getFundingHistory ? window.getFundingHistory() : [];
        let changed = false;
        hist.forEach(h => {
          if (!h.id) return;
          const r = map[h.id];
          if (!r || !r.status || r.status === h.status) return;
          if (r.status === 'approved' && h.status !== 'approved') {
            const amt = +h.amount || 0;
            // SERVER-OWNS-BALANCE: deposits/withdrawals are applied by DB triggers
            // (apply_fx_deposit/withdraw_balance) and adopted from the server — do
            // NOT change the balance locally (would double-count, esp. app-closed).
            // Transfers are now moved by the app_transfer RPC (server-side, both legs).
            // The old per-leg ledger post is DISABLED (would double). 'xfer-' ids are
            // RPC-handled; older non-RPC transfer entries also no longer post here.
          }
          if (r.status === 'approved' || r.status === 'rejected') {
            const lbl = (h.kind === 'deposit' ? 'Deposit' : h.kind === 'withdraw' ? 'Withdrawal' : 'Transfer') + ' $' + (+h.amount || 0).toLocaleString();
            window.alpexaNotify && alpexaNotify({
              type: r.status === 'approved' ? 'approved' : 'rejected',
              pref: h.kind === 'withdraw' ? 'withdrawal' : 'deposit',
              title: lbl + (r.status === 'approved' ? ' approved ✓' : ' rejected')
            });
          }
          h.status = r.status;
          changed = true;
        });
        // Backfill: add any server funding request (deposit/withdraw/transfer) not yet in
        // the local history → a NEW device shows the customer's past funding too.
        const have = {};
        hist.forEach(h => {
          if (h.id) have[String(h.id)] = true;
        });
        rows.forEach(r => {
          const t = r.type || '';
          if (t !== 'deposit' && t !== 'withdraw' && t !== 'transfer') return;
          if (have[String(r.local_id)]) return;
          hist.push({
            id: r.local_id,
            kind: t,
            method: t === 'transfer' ? 'Internal transfer' : r.from_label || r.to_label || t,
            amount: +r.amount || 0,
            currency: 'USD',
            ref: String(r.local_id || ''),
            note: '',
            account: 'live',
            status: r.status || 'pending',
            backfill: true
          });
          changed = true;
        });
        if (changed) {
          try {
            localStorage.setItem('alpexa.funding', JSON.stringify(hist));
          } catch (e) {}
          window.dispatchEvent(new Event('alpexa-balance-change'));
        }
        // Credit transfers that OTHER apps sent to FX (idempotent across apps).
        AlpexaSync.pullIncomingTransfers('live').then(legs => {
          legs.forEach(l => {
            // Money is credited SERVER-SIDE by app_transfer (ledger → balance), adopted
            // below via pullBalances. Do NOT post a ledger credit here (would double).
            // History only.
            try {
              window.pushFundingHistory && window.pushFundingHistory({
                id: 'TRF-IN-' + l.id,
                kind: 'transfer',
                method: 'Internal transfer',
                amount: +l.amount || 0,
                currency: 'USD',
                note: 'Received' + (l.from ? ' from ' + String(l.from).toUpperCase() : '') + ' → FX',
                account: 'live',
                status: 'approved'
              });
            } catch (e) {}
            window.alpexaNotify && alpexaNotify({
              type: 'approved',
              pref: 'deposit',
              title: 'Transfer received · $' + (+l.amount).toLocaleString() + ' → FX'
            });
          });
        }).catch(() => {});
      }).catch(() => {});
    };
    tick();
    const iv = setInterval(() => {
      if (!document.hidden) tick();
    }, 15000);
    const vis = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      stop = true;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  const [acctSheet, setAcctSheet] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('alpexa.fxNotifs') || '[]');
    } catch (e) {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('alpexa.fxNotifs', JSON.stringify(notifications));
    } catch (e) {}
  }, [notifications]);
  // Receive notifications fired anywhere in the app.
  useEffect(() => {
    function onNotify(e) {
      const d = e && e.detail || {};
      const now = new Date();
      const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      setNotifications(prev => [{
        id: Date.now() + Math.random(),
        read: false,
        time,
        ...d
      }, ...prev].slice(0, 60));
    }
    window.addEventListener('alpexa-notify', onNotify);
    return () => window.removeEventListener('alpexa-notify', onNotify);
  }, []);
  // New sign-in (once per browser session)
  useEffect(() => {
    try {
      if (!sessionStorage.getItem('alpexa.loginNotif')) {
        sessionStorage.setItem('alpexa.loginNotif', '1');
        window.alpexaNotify && alpexaNotify({
          type: 'login',
          pref: 'login',
          title: 'New sign-in · ' + (navigator.platform || 'this device')
        });
      }
    } catch (e) {}
  }, []);
  // Market open / closed transitions
  const mktOpenRef = useRef(null);
  useEffect(() => {
    function check() {
      const cur = {
        FX: symOpen({
          cls: 'FX'
        }),
        STOCK: symOpen({
          cls: 'STOCK'
        }),
        INDEX: symOpen({
          cls: 'INDEX'
        })
      };
      const prev = mktOpenRef.current;
      if (prev) {
        [['FX', 'Forex'], ['STOCK', 'US stocks'], ['INDEX', 'Indices']].forEach(([k, lbl]) => {
          if (prev[k] !== cur[k]) window.alpexaNotify && alpexaNotify({
            type: cur[k] ? 'marketOpen' : 'marketClosed',
            title: lbl + (cur[k] ? ' market is now open' : ' market is now closed')
          });
        });
      }
      mktOpenRef.current = cur;
    }
    check();
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, []);
  // Price alerts — fire when the target is crossed, then deactivate.
  useEffect(() => {
    function check() {
      let alerts;
      try {
        alerts = JSON.parse(localStorage.getItem('alpexa.alerts') || '[]');
      } catch (e) {
        return;
      }
      if (!alerts.length || !marketRef.current) return;
      let changed = false;
      alerts.forEach(a => {
        if (!a.active) return;
        const m = marketRef.current.state.find(s => s.sym === a.sym);
        if (!m) return;
        const hit = a.side === 'above' ? m.last >= a.px : m.last <= a.px;
        if (hit) {
          a.active = false;
          changed = true;
          window.alpexaNotify && alpexaNotify({
            type: 'priceAlert',
            pref: 'priceAlert',
            sym: a.sym,
            side: a.side,
            px: a.px
          });
        }
      });
      if (changed) {
        try {
          localStorage.setItem('alpexa.alerts', JSON.stringify(alerts));
        } catch (e) {}
      }
    }
    const iv = setInterval(check, 5000);
    return () => clearInterval(iv);
  }, []);
  const [lots, setLots] = useState(0.10);
  const [indicators, setIndicators] = useState({
    ma: true,
    vol: false,
    bb: false,
    rsi: false,
    macd: false
  });
  // Open positions & pending orders persist across server switches / reloads.
  const [liveOrders, setLiveOrders] = useState([]); // server-only: pullPos adopts open positions from the `positions` table (no localStorage)
  const [pendingOrders, setPendingOrders] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('alpexa.fxPending') || '[]');
    } catch (e) {
      return [];
    }
  });
  const [closedHistory, setClosedHistory] = useState([]); // server-only: merged from `settlements` (no localStorage)
  // ── Cross-device closed-trade history: merge server `settlements` (kind fx_close).
  // Closes on any device write a settlement row; pull them and add the ones not
  // already local (deduped by id), reconstructing side/vol/open/close from `detail`.
  useEffect(() => {
    if (!window.AlpexaSync || !AlpexaSync.db) return;
    let stop = false;
    let me;
    try {
      me = JSON.parse(localStorage.getItem('alpexa.me') || 'null');
    } catch (e) {}
    const cust = me && me.custId;
    if (!cust) return;
    const pull = () => {
      if (document.hidden) return;
      AlpexaSync.db.from('settlements').select('local_id,ticket,symbol,stake,pnl,detail,created_at').eq('cust_id', cust).eq('server', 'fx').eq('kind', 'fx_close').order('created_at', {
        ascending: false
      }).limit(200).then(function (r) {
        if (stop || !r || r.error || !r.data) return;
        setClosedHistory(cur => {
          const have = new Set((cur || []).map(h => String(h.id)));
          const add = [];
          r.data.forEach(function (s) {
            const id = String(s.local_id || s.ticket || '');
            if (!id || have.has(id)) return;
            const m = (s.detail || '').match(/(BUY|SELL)\s+([\d.]+)\s+@\s+([\d.]+)\s*(?:→|->)\s*([\d.]+)/i);
            const d = s.created_at ? new Date(s.created_at) : null;
            const ds = d ? String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : '';
            add.push({
              id: id,
              sym: s.symbol || '',
              side: m ? m[1].toUpperCase() : '',
              vol: m ? +m[2] : +s.stake || 0,
              open: m ? +m[3] : 0,
              close: m ? +m[4] : 0,
              pnl: +s.pnl || 0,
              date: ds,
              placedAt: 0,
              _server: true
            });
          });
          return add.length ? [...(cur || []), ...add] : cur;
        });
      }, function () {});
    };
    const t0 = setTimeout(pull, 1900);
    const iv = setInterval(pull, 8000);
    const vis = () => {
      if (!document.hidden) pull();
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      stop = true;
      clearTimeout(t0);
      clearInterval(iv);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  // Open positions are server-owned (no localStorage). Keep an IN-MEMORY mirror so
  // the module-level sync/heartbeat helpers can read the live set without persisting.
  useEffect(() => {
    window.__fxLive = liveOrders.filter(o => o && +o.vol > 0);
  }, [liveOrders]);
  // ── MULTI-DEVICE: adopt open FX positions from the server (shared truth) ──
  // Add positions opened on another device, drop ones closed elsewhere (6s grace
  // so a just-opened local position isn't dropped before it syncs). pnl is
  // recomputed locally by the live ticker. Matched by acct_no (stable).
  useEffect(() => {
    if (!(window.AlpexaSync && AlpexaSync.db)) return;
    let stop = false;
    function pullPos() {
      let me;
      try {
        me = JSON.parse(localStorage.getItem('alpexa.me') || 'null');
      } catch (e) {
        me = null;
      }
      if (!me || !me.accts || !me.accts.fx) return;
      AlpexaSync.db.from('positions').select('local_id,symbol,side,size,open_price,pnl,status,meta').eq('acct_no', me.accts.fx).eq('server', 'fx').eq('status', 'open').then(function (r) {
        if (stop || !r || !r.data) return;
        const srv = r.data,
          srvIds = {};
        srv.forEach(p => {
          srvIds[String(p.local_id)] = p;
        });
        const metaSl = p => {
          const v = p && p.meta && p.meta.sl;
          return v != null && +v > 0 ? +v : undefined;
        };
        const metaTp = p => {
          const v = p && p.meta && p.meta.tp;
          return v != null && +v > 0 ? +v : undefined;
        };
        setLiveOrders(prev => {
          const have = {};
          prev.forEach(o => {
            have[String(o.id)] = true;
          });
          const now = Date.now();
          const kept = prev.filter(o => srvIds[String(o.id)] || now - (o.placedTs || 0) < 6000);
          // SL/TP 진실 = 서버 positions.meta (fx_modify 저장분). 다른 기기에서 바꾼 값도 여기로 합류.
          // 방금 로컬에서 수정한 건 6s 유예(낙관 반영이 서버 왕복 전에 되돌아가는 깜빡임 방지).
          const merged = kept.map(o => {
            const s = srvIds[String(o.id)];
            if (!s) return o;
            if (o.slTpTs && now - o.slTpTs < 6000) return o;
            const nsl = metaSl(s),
              ntp = metaTp(s);
            return nsl === o.sl && ntp === o.tp ? o : {
              ...o,
              sl: nsl,
              tp: ntp
            };
          });
          const add = [];
          srv.forEach(p => {
            if (have[String(p.local_id)]) return;
            add.push({
              id: p.local_id,
              sym: p.symbol,
              side: p.side,
              vol: +p.size || 0,
              open: +p.open_price || 0,
              pnl: +p.pnl || 0,
              status: 'OPEN',
              sl: metaSl(p),
              tp: metaTp(p),
              placedAt: '',
              placedTs: 0,
              ticket: '',
              fresh: false,
              adopted: true
            });
          });
          const changed = add.length > 0 || kept.length !== prev.length || merged.some((m, i) => m !== kept[i]);
          return changed ? [...add, ...merged] : prev;
        });
      }, function () {});
    }
    pullPos();
    // Poll as a safety-net fallback (Realtime below makes updates near-instant).
    const iv = setInterval(() => {
      if (!document.hidden) pullPos();
    }, 4000);
    const onVis = () => {
      if (!document.hidden) pullPos();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    // ── REALTIME: subscribe to position changes for this FX account (near-instant) ──
    let ch = null;
    try {
      let me;
      try {
        me = JSON.parse(localStorage.getItem('alpexa.me') || 'null');
      } catch (e) {
        me = null;
      }
      if (me && me.accts && me.accts.fx && AlpexaSync.db.channel) {
        ch = AlpexaSync.db.channel('fxpos-' + me.accts.fx).on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'positions',
          filter: 'acct_no=eq.' + me.accts.fx
        }, function (pl) {
          /* 서버 자동청산(fx_sltp/fx_stopout) 알림 — 이 기기에서 방금 누른 청산(closeOrder)은 중복 토스트 방지 */
          try {
            const n = pl && pl.new;
            if (n && n.status === 'closed') {
              const mine = (window.__fxClosing || {})[String(n.local_id)];
              if (!(mine && Date.now() - mine < 20000)) {
                const win = (+n.pnl || 0) >= 0;
                setToast({
                  error: !win,
                  soft: true,
                  icon: win ? 'flag' : 'shield',
                  msg: 'Position closed — ' + n.symbol,
                  sub: 'Server SL/TP · P/L ' + (win ? '+' : '') + (+n.pnl || 0).toFixed(2)
                });
                setTimeout(() => setToast(null), 4000);
                try {
                  window.alpexaNotify && alpexaNotify({
                    type: win ? 'tp' : 'sl',
                    pref: 'slTpHit',
                    title: n.symbol + ' closed by server SL/TP · P/L ' + (+n.pnl || 0).toFixed(2)
                  });
                } catch (e) {}
                if (window.ALPEXA_SFX && ALPEXA_SFX.triggered) ALPEXA_SFX.triggered();
              }
            }
          } catch (e) {}
          pullPos();
        }).subscribe();
      }
    } catch (e) {}
    return () => {
      stop = true;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
      try {
        if (ch && AlpexaSync.db.removeChannel) AlpexaSync.db.removeChannel(ch);
      } catch (e) {}
    };
  }, []);
  // ── Pending orders: adopt from the server (fx_pending), drop ones cancelled/filled
  // elsewhere (6s grace for a just-placed local order). Mirrors the positions sync. ──
  useEffect(() => {
    if (!(window.AlpexaSync && AlpexaSync.db)) return;
    let stop = false;
    let firstPullDone = false; // never drop localStorage-cached pending until the server has answered once (avoids nuking them on reload before fx_pending is reachable)
    function pullPending() {
      let me;
      try {
        me = JSON.parse(localStorage.getItem('alpexa.me') || 'null');
      } catch (e) {
        me = null;
      }
      if (!me || !me.accts || !me.accts.fx) return;
      AlpexaSync.db.from('fx_pending').select('local_id,ticket,symbol,side,size,otype,trigger,sl,tp').eq('acct_no', me.accts.fx).eq('status', 'pending').then(function (r) {
        if (stop || !r || !r.data) return;
        const srv = r.data,
          srvIds = {};
        srv.forEach(p => {
          srvIds[String(p.local_id)] = p;
        });
        setPendingOrders(prev => {
          const have = {};
          prev.forEach(o => {
            have[String(o.id)] = true;
          });
          const now = Date.now();
          // First successful pull after mount: keep ALL cached pending (don't drop)
          // — the server may be momentarily empty/RLS-blocked and we must not lose
          // locally-cached orders. Later pulls reconcile (so cross-device cancels apply).
          const kept = !firstPullDone ? prev.slice() : prev.filter(o => srvIds[String(o.id)] || now - (o.placedTs || 0) < 6000);
          // reconcile sl/tp/trigger edits made on another device (keep same ref if unchanged)
          const merged = kept.map(o => {
            const s = srvIds[String(o.id)];
            if (!s) return o;
            const nsl = s.sl != null ? +s.sl : o.sl,
              ntp = s.tp != null ? +s.tp : o.tp,
              ntr = s.trigger != null ? +s.trigger : o.trigger;
            return nsl === o.sl && ntp === o.tp && ntr === o.trigger ? o : {
              ...o,
              sl: nsl,
              tp: ntp,
              trigger: ntr
            };
          });
          const add = [];
          srv.forEach(p => {
            if (have[String(p.local_id)]) return;
            add.push({
              id: isNaN(+p.local_id) ? p.local_id : +p.local_id,
              sym: p.symbol,
              side: p.side,
              vol: +p.size || 0,
              otype: p.otype,
              trigger: p.trigger != null ? +p.trigger : undefined,
              sl: p.sl != null ? +p.sl : undefined,
              tp: p.tp != null ? +p.tp : undefined,
              status: 'PENDING',
              ticket: p.ticket || '',
              placedAt: '',
              placedTs: 0,
              adopted: true
            });
          });
          const changed = add.length > 0 || kept.length !== prev.length || merged.some((m, i) => m !== kept[i]);
          return changed ? [...add, ...merged] : prev;
        });
        firstPullDone = true; // server has answered once → later pulls may now reconcile/drop
      }, function () {});
    }
    pullPending();
    const iv = setInterval(() => {
      if (!document.hidden) pullPending();
    }, 4000);
    const onVis = () => {
      if (!document.hidden) pullPending();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    let ch = null;
    try {
      let me;
      try {
        me = JSON.parse(localStorage.getItem('alpexa.me') || 'null');
      } catch (e) {
        me = null;
      }
      if (me && me.accts && me.accts.fx && AlpexaSync.db.channel) {
        ch = AlpexaSync.db.channel('fxpend-' + me.accts.fx).on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'fx_pending',
          filter: 'acct_no=eq.' + me.accts.fx
        }, function (pl) {
          /* 서버 스위프가 체결/거절한 순간을 그대로 알림 (클라 감시 제거 후의 UX 유지) */
          try {
            const n = pl && pl.new;
            if (n && n.status === 'filled') {
              const px = n.meta && n.meta.fill_px || n.trigger;
              setToast({
                side: n.side,
                sym: n.symbol,
                vol: +n.size || 0,
                price: px,
                triggered: true
              });
              setTimeout(() => setToast(null), 3200);
              if (window.ALPEXA_SFX) window.ALPEXA_SFX.triggered();
              try {
                window.alpexaNotify && alpexaNotify({
                  type: 'pendingTriggered',
                  pref: 'pendingTriggered',
                  side: n.side,
                  sym: n.symbol,
                  px: String(px),
                  title: n.side + ' ' + n.symbol + ' pending order filled'
                });
              } catch (e) {}
            } else if (n && n.status === 'rejected') {
              setToast({
                error: true,
                soft: true,
                icon: 'warning',
                msg: n.symbol + ' not filled',
                sub: 'Order triggered, but ' + (n.meta && n.meta.reason || 'the server rejected the fill')
              });
              setTimeout(() => setToast(null), 4500);
            }
          } catch (e) {}
          pullPending();
        }).subscribe();
      }
    } catch (e) {}
    return () => {
      stop = true;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
      try {
        if (ch && AlpexaSync.db.removeChannel) AlpexaSync.db.removeChannel(ch);
      } catch (e) {}
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('alpexa.fxPending', JSON.stringify(pendingOrders.map(o => ({
        ...o,
        fresh: false
      }))));
    } catch (e) {}
  }, [pendingOrders]);
  const [modifyTarget, setModifyTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const marketRef = useRef(null);
  if (!marketRef.current) marketRef.current = ALPEXA_MARKET.createMarket();
  const [, force] = useState(0);

  // Instant re-render when leverage changes so usedMargin/free recompute immediately
  useEffect(() => {
    const h = () => force(x => x + 1);
    window.addEventListener('alpexa-leverage-change', h);
    window.addEventListener('alpexa-balance-change', h);
    window.addEventListener('alpexa-prefs-change', h);
    return () => {
      window.removeEventListener('alpexa-leverage-change', h);
      window.removeEventListener('alpexa-balance-change', h);
      window.removeEventListener('alpexa-prefs-change', h);
    };
  }, []);

  // ── Real market data (Twelve Data, free tier ~8 req/min) ──
  // Polls the symbol you're viewing + rotates through the rest one at a time,
  // anchoring real prices; the simulation drifts smoothly around them.
  // Degrades to pure simulation if offline / rate-limited.
  const symRef = useRef(sym);
  symRef.current = sym;
  const accountRef = useRef(account);
  accountRef.current = account;
  const marginCallRef = useRef(false);
  const pullRef = useRef(null);
  // ── Real market data via the SERVER feed (Polygon → prices table → __alpexaFXFeed) ──
  // The shared feed is filled server-side every ~10s (Edge Function + cron) and
  // pulled into window.__alpexaFXFeed every ~1.5s. We anchor the engine to it as a
  // TRUSTED source; the simulation drifts smoothly between updates. No API key in
  // the client. Symbols the feed doesn't carry (stocks/indices) keep simulating.
  useEffect(() => {
    window.__alpexaFXPrev = window.__alpexaFXPrev || {};
    window.__alpexaFastMkt = window.__alpexaFastMkt || {};
    function applyFeed() {
      if (document.hidden) return;
      const f = window.__alpexaFXFeed || {};
      const o = {};
      let any = false;
      Object.keys(f).forEach(sym => {
        const px = +(f[sym] && f[sym].mid) || 0;
        if (px > 0) {
          // Fast-market: if the real feed just jumped sharply, flag this symbol so
          // new orders are briefly rejected (anti latency-arbitrage on spikes).
          const prev = window.__alpexaFXPrev[sym];
          if (prev > 0 && Math.abs(px - prev) / prev > 0.0025) {
            window.__alpexaFastMkt[sym] = Date.now() + 5000;
          }
          window.__alpexaFXPrev[sym] = px;
          o[sym] = px;
          any = true;
        }
      });
      if (any) {
        marketRef.current.applyReal(o, true);
        force(x => x + 1);
      }
    }
    function pull(s) {
      if (!s) return;
      const f = window.__alpexaFXFeed || {};
      const px = +(f[s.sym] && f[s.sym].mid) || 0;
      if (px > 0) {
        const o = {};
        o[s.sym] = px;
        marketRef.current.applyReal(o, true);
        force(x => x + 1);
      }
    }
    pullRef.current = pull;
    applyFeed();
    const ivF = setInterval(applyFeed, 1000);
    return () => {
      clearInterval(ivF);
    };
  }, []);
  // Immediately anchor the symbol you just opened from the feed (ready to trade fast).
  useEffect(() => {
    const s = ALPEXA_MARKET.SYMBOLS.find(x => x.sym === sym);
    if (s && pullRef.current) pullRef.current(s);
  }, [sym]);
  useEffect(() => {
    const id = setInterval(() => {
      marketRef.current.tick();
      /* (클라 SL/TP 자동청산 제거 — 2026-07-22 "고고". SL/TP는 fx_modify로 서버 저장,
         집행은 서버 fx_sltp 단독: 24시간 초단위+워터마크(스침) 판정 + 레벨가 정산 + 원자 선점.
         앱이 꺼져 있어도 터진다. 청산 알림은 positions Realtime status='closed'에서.) */
      const levSet = window.getLeverageSettings ? window.getLeverageSettings() : {
        FX: 100,
        INDEX: 20,
        STOCK: 5,
        CRYPTO: 5
      };
      let floatPnl = 0,
        usedM = 0,
        worst = null;
      setLiveOrders(prev => prev.map(o => {
        if (o.status !== 'OPEN') return o;
        const m = marketRef.current.state.find(s => s.sym === o.sym);
        if (!m) return o;
        const cur = ALPEXA_MARKET.fxClosePx(m, o.side); // server-mirror close price (no phantom spread)
        const pnl = ALPEXA_MARKET.getPnlUSD(m, o.open, cur, o.side, o.vol);
        // tally floating P&L + used margin for the margin-level check
        floatPnl += pnl;
        usedM += ALPEXA_MARKET.getMarginUSD(m, o.vol || 0, o.open || 0, levSet[m.cls] || 100);
        if (!worst || pnl < worst.pnl) worst = {
          id: o.id,
          pnl,
          sym: o.sym
        };
        return {
          ...o,
          pnl,
          current: cur
        };
      }));
      // ── Margin call (100%) + stop out (50%) ──
      // Include the static demo positions in the floating P&L / used margin too.
      ALPEXA_MARKET.POSITIONS.forEach(p => {
        floatPnl += p.pnl || 0;
        const m = marketRef.current.state.find(s => s.sym === p.sym);
        if (m) usedM += ALPEXA_MARKET.getMarginUSD(m, p.vol || 0, p.open || 0, levSet[m.cls] || 100);
      });
      // Keep the server-switcher FX value in sync with live Equity (cash balance +
      // floating P&L) so the switcher matches the balance card instead of showing
      // only the cash balance.
      try {
        const eqBal = (window.getBalances ? window.getBalances() : {})[accountRef.current] || 0;
        const sbo = window.__fxSrvBal || {};
        sbo.fx = eqBal + floatPnl;
        window.__fxSrvBal = sbo;
        // SERVER-OWNS-BALANCE: do NOT push the full equity here. accounts.balance
        // is owned by the DB triggers (deposit/withdraw/settlement) + ledger and
        // adopted below. Pushing the absolute equity clobbered those server-side
        // changes. (Cash = accounts.balance; equity = cash + floating P&L locally.)
      } catch (e) {}
      if (usedM >= 0.01) {
        const bal = (window.getBalances ? window.getBalances() : {})[accountRef.current] || 0;
        const lvl = (bal + floatPnl) / usedM * 100;
        /* (클라 스탑아웃 제거 — 2026-07-23 "1번 고". 강제청산은 서버 fx_stopout(30%) 단독:
           클라 자체 계산(50% 기준·표시가)이 서버와 어긋나면 멀쩡한 계좌를 일찍 청산할 수 있는
           이중 판정 경로였다. 클라는 경고(마진콜 토스트)까지만 — 집행은 서버.) */
        if (lvl < 100) {
          if (!marginCallRef.current) {
            marginCallRef.current = true;
            try {
              window.alpexaNotify && alpexaNotify({
                type: 'marginCall',
                pref: 'marginCall',
                title: 'Margin call · level ' + Math.round(lvl) + '% — add funds or reduce positions'
              });
            } catch (e) {}
            setToast({
              error: true,
              soft: true,
              icon: 'warning',
              msg: 'Margin call — ' + Math.round(lvl) + '%',
              sub: 'Add funds or close positions to avoid stop out (50%)'
            });
            setTimeout(() => setToast(null), 4500);
          }
        } else if (lvl >= 120) {
          marginCallRef.current = false;
        } // re-arm once safely recovered
      } else {
        marginCallRef.current = false;
      }
      /* (구식 클라 트리거 감시 제거 — 2026-07-22 "고고", "진실은 한 곳" #5.)
         판정·체결·감사는 서버 fx_pending_fill이 유일 경로: 워터마크(스침) 판정 + 원자 선점 +
         단일 체결 코어(fx_fill_internal) + rejected 사유 보존, 에지 스위프로 초단위 반응.
         체결의 화면 반영은 fx_pending Realtime(status 변경 → 토스트/사운드 + pullPending)과
         positions 어댑트(pullPos)가 담당. 클라가 fx_pending 행을 지우던 경로는 폐쇄됐다
         (옛 delete는 status 무관이라 서버의 filled/rejected 감사 행까지 지울 수 있었다). */
      force(x => x + 1);
    }, 700);
    return () => clearInterval(id);
  }, []);
  function placeOrder(orderData) {
    // Kill switch: if the back office halted trading, block new orders.
    if (window.__alpexaHalt) {
      if (window.ALPEXA_SFX && ALPEXA_SFX.error) ALPEXA_SFX.error();
      setToast({
        error: true,
        icon: 'lock',
        msg: 'Trading paused',
        sub: 'New orders are temporarily disabled. Please try again shortly.'
      });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    // Guard: only block a genuinely closed market. If the live price hasn't
    // loaded yet (free data tier is rate-limited), still fill at the current
    // simulated price and fetch the real one in the background — never block.
    const sObj = marketRef.current.state.find(x => x.sym === orderData.sym);
    if (sObj) {
      const TT = window.alpexaTR || (x => x);
      if (!symOpen(sObj)) {
        if (window.ALPEXA_SFX && ALPEXA_SFX.error) ALPEXA_SFX.error();
        setToast({
          error: true,
          icon: 'lock',
          msg: TT('Market closed'),
          sub: orderData.sym + ' · ' + (sObj.cls === 'STOCK' ? 'Stocks 09:30–16:00 ET (Mon–Fri)' : sObj.cls === 'INDEX' ? 'Index hours' : 'FX 24/5 (closed weekends)')
        });
        setTimeout(() => setToast(null), 4000);
        return;
      }
      if (!sObj.real && pullRef.current) {
        pullRef.current(sObj);
      }
    }
    // ── Arbitrage defense (FX market orders) ──
    // Fast market: the real feed just spiked → reject so nobody can lock in a
    // stale price right before our quote catches up (latency-arb on news moves).
    if (sObj && sObj.cls === 'FX' && (!orderData.otype || orderData.otype === 'MARKET')) {
      if (window.__alpexaFastMkt && Date.now() < (window.__alpexaFastMkt[sObj.sym] || 0)) {
        if (window.ALPEXA_SFX && ALPEXA_SFX.error) ALPEXA_SFX.error();
        setToast({
          error: true,
          icon: 'bolt',
          msg: 'Price moving fast',
          sub: sObj.sym + ' just moved sharply — re-check the price and try again.'
        });
        setTimeout(() => setToast(null), 3500);
        return;
      }
    }
    const id = Date.now();
    const now = new Date();
    const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
    if (orderData.otype && orderData.otype !== 'MARKET') {
      const newPending = {
        id,
        ...orderData,
        status: 'PENDING',
        placedAt: time,
        placedTs: Date.now(),
        ticket: alpexaTicket('FX')
      };
      setPendingOrders(prev => [newPending, ...prev]);
      fxPendingPlace(newPending, function (err) {
        // 서버 검증 거절 → 로컬 행 회수 + 사유 (조용한 유령 대기주문 금지)
        setPendingOrders(prev => prev.filter(p => p.id !== id));
        setToast({
          error: true,
          icon: 'warning',
          msg: 'Pending order rejected',
          sub: /wrong side/i.test(err) ? 'Trigger price is on the wrong side of the market' : err
        });
        setTimeout(() => setToast(null), 3800);
      });
      setToast({
        side: orderData.side,
        sym: orderData.sym,
        vol: orderData.vol,
        price: orderData.trigger,
        pending: true,
        otype: orderData.otype
      });
      setTimeout(() => setToast(null), 3200);
      if (window.ALPEXA_SFX) window.ALPEXA_SFX.pendingPlaced();
      setTab('HIST');
      setPosTab('PEND');
      return;
    }
    // Last-look: fill FX at the feed-ANCHORED price (sObj.bid), not the wiggling
    // sim 'last' — so a trader can't exploit a momentary sim dip/spike. If the
    // anchored price diverged from what the user saw by >0.3% (above sim noise),
    // requote instead of silently filling at a very different price.
    let fillBase = orderData.open;
    if (sObj && sObj.cls === 'FX' && sObj.bid > 0) {
      fillBase = orderData.side === 'BUY' ? sObj.bid + (sObj.spread || 0) : sObj.bid;
      if (orderData.open > 0 && Math.abs(fillBase - orderData.open) / orderData.open > 0.003) {
        if (window.ALPEXA_SFX && ALPEXA_SFX.error) ALPEXA_SFX.error();
        setToast({
          error: true,
          icon: 'autorenew',
          msg: 'Requote',
          sub: sObj.sym + ' price changed — please confirm at the new price.'
        });
        setTimeout(() => setToast(null), 3500);
        return;
      }
    }
    const fillPx = sObj ? applySlippage(sObj, orderData.side, fillBase, 'MARKET') : fillBase;
    // Create the position with a SERVER-decided entry price (fx_open) so the
    // open_price can't be forged to fake P&L at close. If the server can't price it
    // (no spec / stale / offline) we fall back to the feed-anchored client fill.
    // The ticket is generated once so it stays stable across the async call.
    const _ticket = alpexaTicket('FX');
    const finalize = openPx => {
      const newOrder = {
        id,
        ...orderData,
        open: openPx,
        status: 'OPEN',
        placedAt: time,
        placedTs: Date.now(),
        ticket: _ticket,
        pnl: 0,
        fresh: true
      };
      // dedupe: the realtime adopt (pullPos) may have already added this id after
      // fx_open created the row — never show / sync the same position twice.
      setLiveOrders(prev => prev.some(o => String(o.id) === String(id)) ? prev : [newOrder, ...prev]);
      try {
        window.broadcastPositionOpen && window.broadcastPositionOpen(newOrder, account);
      } catch (e) {}
      try {
        window.AlpexaSync && AlpexaSync.logActivity({
          server: 'fx',
          kind: 'trade_open',
          symbol: orderData.sym,
          amount: orderData.vol || 0,
          ticket: _ticket,
          detail: (orderData.side || '') + ' ' + (orderData.vol || 0) + ' lots @ ' + openPx
        });
      } catch (e) {}
      setToast({
        side: orderData.side,
        sym: orderData.sym,
        vol: orderData.vol,
        price: openPx
      });
      setTimeout(() => setToast(null), 3200);
      if (window.ALPEXA_SFX) window.ALPEXA_SFX.orderFill(orderData.side);
      setTimeout(() => {
        setLiveOrders(prev => prev.map(o => o.id === id ? {
          ...o,
          fresh: false
        } : o));
      }, 1500);
      setTab('HIST');
      setPosTab('OPEN');
    };
    let _me;
    try {
      _me = JSON.parse(localStorage.getItem('alpexa.me') || 'null');
    } catch (e) {}
    if (window.AlpexaSync && AlpexaSync.db && _me && _me.accts && _me.accts.fx) {
      AlpexaSync.db.rpc('fx_open', {
        p_local_id: String(id),
        p_symbol: orderData.sym,
        p_side: orderData.side,
        p_size: orderData.vol
      }).then(function (r) {
        const d = r && r.data;
        if (d && d.ok && d.open != null) {
          finalize(+d.open);
          // SL/TP 결정적 부착 — 서버가 돌려준 그 local_id로 즉시 fx_modify (웹트레이드·터미널과 동일 패턴)
          if (+orderData.sl > 0 || +orderData.tp > 0) fxModifyReal(id, orderData.sl, orderData.tp, function (err) {
            setToast({
              error: true,
              icon: 'warning',
              msg: 'SL/TP not set',
              sub: /wrong side/i.test(err) ? 'Level is on the wrong side of the market' : err
            });
            setTimeout(() => setToast(null), 3800);
            setLiveOrders(prev => prev.map(o => String(o.id) === String(id) ? {
              ...o,
              sl: undefined,
              tp: undefined,
              slTpTs: 0
            } : o));
          });
          return;
        } // server CREATED it → show
        // #5/F ONE-WAY: fx_open is the ONLY creator of a position. ANY non-ok (margin / no
        // price / stale / no spec) → REJECT — never a client-side open (that was the bypass:
        // over-leverage, un-priced symbols). Tell the user why instead of faking a fill.
        var err = String(d && d.error || '');
        var sub = /margin|insufficient|balance/i.test(err) ? d.required != null ? 'Needs $' + d.required + ' margin · free $' + (d.free != null ? d.free : '?') : 'Insufficient margin' : /stale|price/i.test(err) ? 'Price unavailable right now — try again' : /spec/i.test(err) ? orderData.sym + ' isn’t available to trade right now' : err || 'Order could not be placed — try again';
        setToast({
          error: true,
          icon: 'warning',
          msg: 'Order rejected',
          sub: sub
        });
        setTimeout(() => setToast(null), 3800);
      }, function () {
        setToast({
          error: true,
          icon: 'warning',
          msg: 'Order not placed',
          sub: 'Connection issue — please try again'
        });
        setTimeout(() => setToast(null), 3800);
      });
    } else {
      setToast({
        error: true,
        icon: 'lock',
        msg: 'Order not placed',
        sub: 'No server connection — try again'
      });
      setTimeout(() => setToast(null), 3800);
    }
  }
  function cancelPending(id) {
    setPendingOrders(prev => prev.filter(p => p.id !== id));
    fxPendingCancel(id);
  }
  // 열린 포지션 SL/TP = 서버 저장(fx_modify) + 서버 집행(fx_sltp). 낙관 반영 → 거절 시 원복+사유.
  function modifyPosition(updated) {
    const old = liveOrders.find(o => o.id === updated.id) || {};
    setLiveOrders(prev => prev.map(o => o.id === updated.id ? {
      ...o,
      sl: updated.sl,
      tp: updated.tp,
      slTpTs: Date.now()
    } : o));
    fxModifyReal(updated.id, updated.sl, updated.tp, function (err) {
      setLiveOrders(prev => prev.map(o => o.id === updated.id ? {
        ...o,
        sl: old.sl,
        tp: old.tp,
        slTpTs: 0
      } : o));
      setToast({
        error: true,
        icon: 'warning',
        msg: 'SL/TP rejected',
        sub: /wrong side/i.test(err) ? 'Level is on the wrong side of the market' : err
      });
      setTimeout(() => setToast(null), 3800);
    });
    if (window.ALPEXA_SFX) window.ALPEXA_SFX.tick();
  }
  // 수정 = 서버 취소 + 새 local_id로 재접수. (fx_place_pending은 멱등 on-conflict-do-nothing이라
  // 같은 키 재접수는 침묵 무시 — cancelled 행이 키를 점유하므로 반드시 새 id. 검증도 재적용된다.)
  function modifyPending(updated) {
    const nid = Date.now();
    setPendingOrders(prev => prev.map(p => {
      if (p.id !== updated.id) return p;
      const np = {
        ...p,
        id: nid,
        sl: updated.sl,
        tp: updated.tp,
        trigger: updated.trigger,
        placedTs: Date.now()
      };
      try {
        fxPendingCancel(p.id);
        fxPendingPlace(np, function (err) {
          setPendingOrders(pr => pr.filter(x => x.id !== nid));
          setToast({
            error: true,
            icon: 'warning',
            msg: 'Modify rejected',
            sub: /wrong side/i.test(err) ? 'Trigger price is on the wrong side of the market' : err
          });
          setTimeout(() => setToast(null), 3800);
        });
      } catch (e) {}
      return np;
    }));
    if (window.ALPEXA_SFX) window.ALPEXA_SFX.tick();
  }
  function closeOrder(id) {
    const order = liveOrders.find(o => String(o.id) === String(id));
    setLiveOrders(prev => prev.filter(o => String(o.id) !== String(id))); // remove from this device's UI now
    if (!order) return;
    try {
      (window.__fxClosing = window.__fxClosing || {})[String(id)] = Date.now();
    } catch (e) {} // 이 기기발 청산 표식(Realtime 중복 토스트 방지)
    const m = marketRef.current.state.find(s => s.sym === order.sym);
    const closePrice = m ? ALPEXA_MARKET.fxClosePx(m, order.side) : order.open; // server-mirror (matches realized)
    const pnl = order.pnl || 0,
      acct = accountRef.current;
    const now = new Date();
    const dateStr = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    // Local display/history bookkeeping — records the closed-trade row and moves
    // THIS device's displayed balance. The realized P&L + close price come from the
    // server when it settles (so the figures match the authoritative balance).
    function bankLocal(px, realized) {
      setClosedHistory(h => [{
        id: order.id,
        sym: order.sym,
        side: order.side,
        vol: order.vol,
        open: order.open,
        close: px,
        pnl: realized,
        date: dateStr,
        placedAt: order.placedAt
      }, ...h]);
      try {
        window.addBalance && window.addBalance(acct, realized);
      } catch (e) {}
    }
    function done(px, realized) {
      try {
        window.broadcastPositionClose && window.broadcastPositionClose(order.id, px, realized);
      } catch (e) {}
      if (window.ALPEXA_SFX) window.ALPEXA_SFX.closed();
    }
    let me;
    try {
      me = JSON.parse(localStorage.getItem('alpexa.me') || 'null');
    } catch (e) {}
    // 청산 실패 = 포지션 그대로 (2026-07-23 "1번 고" — 클라 정산 폴백 폐지, "돈은 서버만" #5 완결).
    // 옛 폴백은 클라 가격·클라 P&L로 settlements를 직접 insert + positions를 delete했다 —
    // 서버가 가격을 모르는 순간에 "클라 추측"으로 돈을 옮기던 마지막 경로. 이제 fx_close가
    // 거절하면 정직하게 실패를 알리고 행을 되살린다 (서버 행은 그대로 open — 돈은 안 움직였다).
    function closeFailed(sub) {
      try {
        delete (window.__fxClosing || {})[String(id)];
      } catch (e) {}
      setLiveOrders(prev => prev.some(o => String(o.id) === String(id)) ? prev : [order, ...prev]); // UI 원복
      setToast({
        error: true,
        icon: 'warning',
        msg: 'Close failed — ' + order.sym,
        sub: sub
      });
      setTimeout(() => setToast(null), 4000);
    }
    if (window.AlpexaSync && AlpexaSync.db && me && me.accts && me.accts.fx) {
      // SERVER-AUTHORITATIVE close: fx_close picks the SERVER price, computes P&L,
      // banks it via the settlement trigger, and closes the row atomically (so a
      // frozen client price can't be used to bank a wrong number, and two devices
      // can't double-bank). We only sync the local display from the server result.
      AlpexaSync.db.rpc('fx_close', {
        p_local_id: String(order.id)
      }).then(function (r) {
        const d = r && r.data;
        if (d && d.ok === true) {
          if (d.duplicate) {
            done(closePrice, pnl);
            return;
          } // closed elsewhere → server already banked
          var px = d.close != null ? +d.close : closePrice;
          var realized = d.pnl != null ? +d.pnl : pnl;
          bankLocal(px, realized); // server already wrote settlement+balance; do NOT settle again
          done(px, realized);
        } else {
          var err = String(d && d.error || '');
          closeFailed(/stale|price/i.test(err) ? 'Price unavailable right now — try again in a moment' : err || 'Server rejected the close — try again');
        }
      }, function () {
        closeFailed('Connection issue — position is untouched, try again');
      });
    } else {
      closeFailed('No server connection — sign in to close positions');
    }
  }
  // Expose force-close so the back-office command reader can liquidate a position.
  window.__alpexaFXClose = lid => {
    try {
      const o = liveOrders.find(x => String(x.id) === String(lid));
      if (o) closeOrder(o.id);
    } catch (e) {}
  };
  const market = marketRef.current.state;
  useEffect(() => {
    document.documentElement.style.setProperty('--acc', tweaks.accent);
  }, [tweaks.accent]);
  const staticPnl = ALPEXA_MARKET.POSITIONS.reduce((s, p) => s + (p.pnl || 0), 0);
  const ordersPnl = liveOrders.reduce((s, o) => s + (o.pnl || 0), 0);
  const livePnl = staticPnl + ordersPnl;
  // Include both live orders AND demo positions so leverage changes reflect on balance card
  const usedMargin = [...liveOrders, ...ALPEXA_MARKET.POSITIONS].reduce((sum, o) => {
    const m = marketRef.current.state.find(s => s.sym === o.sym);
    if (!m) return sum;
    const lev = (typeof window.getLeverageSettings === 'function' ? window.getLeverageSettings() : {
      FX: 100,
      INDEX: 20,
      STOCK: 5,
      CRYPTO: 5
    })[m.cls] || 100;
    return sum + ALPEXA_MARKET.getMarginUSD(m, o.vol || 0, o.open || 0, lev);
  }, 0);
  const prevPnlRef = useRef(livePnl);
  const prevPnl = prevPnlRef.current;
  useEffect(() => {
    prevPnlRef.current = livePnl;
  }, [livePnl]);
  // On load, adopt the server FX balance if the back office set it (server > 0 and
  // differs from local). Protects owner $1M / fresh signup by ignoring 0.
  useEffect(() => {
    if (!window.AlpexaSync || !AlpexaSync.db) return;
    try {
      const meId = JSON.parse(localStorage.getItem('alpexa.me') || 'null');
      const acct = meId && meId.accts && meId.accts.fx;
      if (!acct) return;
      AlpexaSync.db.from('accounts').select('balance').eq('acct_no', acct).limit(1).then(r => {
        if (!r || !r.data || !r.data.length) return;
        const sv = +r.data[0].balance || 0;
        const b = getBalances();
        if (sv > 0 && Math.abs(sv - (b.live || 0)) > 0.01) {
          setBalances({
            ...b,
            live: sv
          });
        }
      }, () => {});
    } catch (e) {}
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    className: "app"
  }, tab !== 'CHART' && /*#__PURE__*/React.createElement(AppHeader, {
    accent: tweaks.accent,
    account: account,
    onAccountClick: () => setAcctSheet(true),
    livePnl: livePnl,
    prevPnl: prevPnl,
    usedMargin: usedMargin,
    notifCount: notifications.filter(n => !n.read).length,
    onBellClick: () => setNotifOpen(true),
    onMenuClick: () => setMenuOpen(true),
    tab: tab
  }), tab === 'WATCH' && /*#__PURE__*/React.createElement(Watchlist, {
    market: market,
    current: sym,
    onSelect: s => {
      setSym(s);
      setTab('CHART');
    },
    onDepositCrypto: () => {
      try {
        localStorage.setItem('alpexa.openDeposit', 'crypto');
      } catch (e) {}
      setTab('ACCT');
    }
  }), tab === 'CHART' && /*#__PURE__*/React.createElement(ChartScreen, {
    market: market,
    sym: sym,
    setSym: setSym,
    accent: tweaks.accent,
    density: tweaks.density,
    indicators: indicators,
    setIndicators: setIndicators,
    lots: lots,
    setLots: setLots,
    onPlace: placeOrder
  }), tab === 'TRADE' && /*#__PURE__*/React.createElement(TradeTicket, {
    market: market,
    sym: sym,
    setSym: setSym,
    lots: lots,
    setLots: setLots,
    onPlace: placeOrder
  }), tab === 'HIST' && /*#__PURE__*/React.createElement(Positions, {
    tab: posTab,
    setTab: setPosTab,
    liveOrders: liveOrders,
    pendingOrders: pendingOrders,
    closedHistory: closedHistory,
    market: market,
    onClose: closeOrder,
    onCancelPending: cancelPending,
    onModify: p => setModifyTarget({
      position: p,
      isPending: false
    }),
    onModifyPending: p => setModifyTarget({
      position: p,
      isPending: true
    })
  }), tab === 'ACCT' && /*#__PURE__*/React.createElement(Account, {
    openPositions: liveOrders.length,
    onNavigate: setTab
  }), modifyTarget && /*#__PURE__*/React.createElement(ModifySheet, {
    position: modifyTarget.position,
    isPending: modifyTarget.isPending,
    market: market,
    onSave: modifyTarget.isPending ? modifyPending : modifyPosition,
    onClose: () => setModifyTarget(null)
  }), /*#__PURE__*/React.createElement(BottomNav, {
    tab: tab,
    setTab: setTab
  }), /*#__PURE__*/React.createElement(AccountSheet, {
    open: acctSheet,
    current: account,
    onPick: setAccount,
    onClose: () => setAcctSheet(false)
  }), notifOpen && /*#__PURE__*/React.createElement(NotificationSheet, {
    notifications: notifications,
    setNotifications: setNotifications,
    onClose: () => setNotifOpen(false)
  }), menuOpen && /*#__PURE__*/React.createElement(AppMenu, {
    indicators: indicators,
    setIndicators: setIndicators,
    liveOrders: liveOrders,
    closedHistory: closedHistory,
    onClose: () => setMenuOpen(false)
  }), toast && toast.error && toast.soft &&
  /*#__PURE__*/
  // Non-blocking warning banner for AUTOMATIC alerts (margin call / stop out). A
  // blocking modal here re-fired every price tick and trapped the user — unable to
  // close the very position causing it. This banner sits on top, auto-dismisses,
  // and never covers the close controls.
  React.createElement("div", {
    style: {
      position: 'absolute',
      top: 96,
      left: 14,
      right: 14,
      zIndex: 560,
      background: 'var(--surface)',
      borderRadius: 11,
      padding: '12px 14px',
      boxShadow: 'var(--shadow-lg)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      animation: 'tIn 0.3s cubic-bezier(0.2,0.8,0.2,1)',
      borderLeft: '4px solid #E04141'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 16,
      background: '#FFEBEE',
      color: '#E04141',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: toast.icon || 'warning',
    size: 18,
    fill: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: 0.2,
      color: 'var(--ink)'
    }
  }, toast.msg), toast.sub ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-2)',
      marginTop: 2
    }
  }, toast.sub) : null), /*#__PURE__*/React.createElement("button", {
    onClick: () => setToast(null),
    style: {
      color: 'var(--text-3)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "close",
    size: 16
  }))), toast && toast.error && !toast.soft && /*#__PURE__*/React.createElement("div", {
    onClick: () => setToast(null),
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 600,
      background: 'rgba(10,14,26,0.55)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      animation: 'tFade .18s ease'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: '100%',
      maxWidth: 300,
      background: 'var(--surface)',
      borderRadius: 18,
      padding: '24px 22px 18px',
      textAlign: 'center',
      boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      animation: 'tPop .22s cubic-bezier(0.34,1.56,0.64,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 60,
      height: 60,
      borderRadius: 30,
      background: '#FFEBEE',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 14px'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: toast.icon || 'lock',
    size: 30,
    fill: true,
    style: {
      color: '#E04141'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 800,
      color: 'var(--ink)',
      letterSpacing: -0.2
    }
  }, toast.msg), toast.sub ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-2)',
      lineHeight: 1.5,
      marginTop: 7
    }
  }, toast.sub) : null, /*#__PURE__*/React.createElement("button", {
    onClick: () => setToast(null),
    style: {
      width: '100%',
      marginTop: 18,
      padding: '13px 0',
      borderRadius: 11,
      fontSize: 14,
      fontWeight: 700,
      color: '#fff',
      background: '#1B3955',
      border: '1px solid #0F2742'
    }
  }, "OK")), /*#__PURE__*/React.createElement("style", null, `@keyframes tFade{from{opacity:0}to{opacity:1}}@keyframes tPop{from{transform:scale(0.9);opacity:0}to{transform:scale(1);opacity:1}}`)), toast && !toast.error && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 96,
      left: 14,
      right: 14,
      zIndex: 500,
      background: 'var(--ink)',
      color: 'var(--ink-fg)',
      borderRadius: 11,
      padding: '12px 14px',
      boxShadow: 'var(--shadow-lg)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      animation: 'tIn 0.3s cubic-bezier(0.2,0.8,0.2,1)',
      borderLeft: '4px solid ' + (toast.pending ? 'var(--warn)' : toast.side === 'BUY' ? 'var(--buy-bright)' : 'var(--sell-bright)')
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 16,
      background: toast.pending ? 'rgba(229,139,30,0.18)' : toast.side === 'BUY' ? 'var(--buy-glow)' : 'var(--sell-glow)',
      color: toast.pending ? 'var(--warn)' : toast.side === 'BUY' ? 'var(--buy-bright)' : 'var(--sell-bright)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: toast.pending ? 'hourglass_empty' : toast.triggered ? 'bolt' : toast.side === 'BUY' ? 'trending_up' : 'trending_down',
    size: 18,
    fill: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: 0.2
    }
  }, toast.pending ? `${toast.otype} Order Pending · ${toast.side} ${toast.vol.toFixed(2)} ${toast.sym}` : toast.triggered ? `Triggered · ${toast.side} ${toast.vol.toFixed(2)} ${toast.sym}` : `Order Filled · ${toast.side} ${toast.vol.toFixed(2)} ${toast.sym}`), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 10.5,
      color: 'rgba(255,255,255,0.55)',
      marginTop: 2
    }
  }, toast.pending ? 'Trigger @ ' : '@ ', toast.price.toFixed(5).replace(/\.?0+$/, p => p === '.' ? '' : p))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setToast(null),
    style: {
      color: 'rgba(255,255,255,0.5)'
    }
  }, /*#__PURE__*/React.createElement(Mi, {
    name: "close",
    size: 16
  })), /*#__PURE__*/React.createElement("style", null, `@keyframes tIn{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}`)), /*#__PURE__*/React.createElement(TweaksPanel, {
    title: "Tweaks"
  }, /*#__PURE__*/React.createElement(TweakSection, {
    label: "Accent Color"
  }, /*#__PURE__*/React.createElement(TweakColor, {
    label: "Accent",
    value: tweaks.accent,
    onChange: v => setTweak('accent', v),
    options: ['#1565C0', '#0EA5E9', '#22B8CF', '#10B981', '#8B5CF6']
  })), /*#__PURE__*/React.createElement(TweakSection, {
    label: "Layout Density"
  }, /*#__PURE__*/React.createElement(TweakRadio, {
    label: "Density",
    value: tweaks.density,
    onChange: v => setTweak('density', v),
    options: [{
      value: 'compact',
      label: 'Compact'
    }, {
      value: 'cozy',
      label: 'Cozy'
    }]
  })), /*#__PURE__*/React.createElement(TweakSection, {
    label: "Indicators"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 6
    }
  }, [['ma', 'MA(20)'], ['vol', 'Volume'], ['bb', 'Bollinger'], ['rsi', 'RSI'], ['macd', 'MACD']].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setIndicators({
      ...indicators,
      [k]: !indicators[k]
    }),
    style: {
      padding: '7px 10px',
      borderRadius: 7,
      fontSize: 11.5,
      fontWeight: 600,
      background: indicators[k] ? '#0A0E1A' : '#F4F6FA',
      color: indicators[k] ? '#fff' : '#5A6478',
      textAlign: 'left'
    }
  }, indicators[k] ? '● ' : '○ ', l))))));
}

// ── Root (Firebase Auth Gate) ──
function Root() {
  const [user, setUser] = useState(undefined); // undefined = loading
  // Track viewport so we can disable the iOS device frame on small screens.
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 480);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 480);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    // Auth is handled by Supabase (login.html). This screen only needs a non-null
    // user object to render; real identity/accounts come from alpexa.me + AlpexaSync.
    setUser({
      email: '',
      displayName: '',
      uid: ''
    }); // non-null render gate only; real identity = alpexa.me
  }, []);
  if (user === undefined || !user) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#E5E7EB'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 48,
        height: 48,
        border: '4px solid rgba(21,101,192,0.2)',
        borderTopColor: '#1565C0',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }
    }), /*#__PURE__*/React.createElement("style", null, `@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`));
  }

  // On mobile, render the app full-bleed without the iOS device frame.
  // Use a DEFINITE height (100dvh) so the .app{height:100%} and the chart's
  // fill-container logic have a bounded parent (prevents infinite growth).
  if (isMobile) {
    return /*#__PURE__*/React.createElement("div", {
      className: "fx-mobile-shell",
      style: {
        width: '100%',
        overflow: 'hidden',
        background: '#fff'
      }
    }, /*#__PURE__*/React.createElement(App, null));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: 'var(--app-vh, 100vh)',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px 0',
      background: '#E5E7EB'
    }
  }, /*#__PURE__*/React.createElement(IOSDevice, {
    width: 402,
    height: 874
  }, /*#__PURE__*/React.createElement(App, null)));
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/React.createElement(Root, null));

// Measure the REAL visible height (visualViewport excludes browser toolbars) into
// --app-vh. The desktop device frame is capped to this via CSS (.ios-device
// max-height) so its internal scroll keeps the bottom buttons visible on every
// screen — no zoom/transform (those broke rendering / aren't universally supported).
(function () {
  var root = document.documentElement;
  var el = document.getElementById('root');
  function setVH() {
    try {
      var h = window.visualViewport && window.visualViewport.height || window.innerHeight;
      root.style.setProperty('--app-vh', Math.round(h) + 'px');
    } catch (e) {}
    if (el) {
      el.style.zoom = '';
      el.style.transform = '';
    } // clear any stale scale
  }
  setVH();
  window.addEventListener('resize', setVH);
  window.addEventListener('orientationchange', function () {
    setVH();
    setTimeout(setVH, 300);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setVH);
    window.visualViewport.addEventListener('scroll', setVH);
  }
  [60, 300, 800].forEach(function (ms) {
    setTimeout(setVH, ms);
  });
})();
