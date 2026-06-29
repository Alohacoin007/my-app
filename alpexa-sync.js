/* Alpexa shared sync layer.
   Sends every money request (deposit / withdraw / transfer) to the shared
   Supabase server so the back office can see ALL customers' activity.
   If Supabase is unavailable (no internet / CDN blocked) every function
   degrades to a harmless no-op so the apps keep working on localStorage. */
window.AlpexaSync = (function () {
  var URL = 'https://grxnbgtfnaayeluenvqh.supabase.co';
  var KEY = 'sb_publishable_ow1DihBdAAvNtnb1H0Kojw_7vbeMKFu';
  var db = null;
  try {
    if (window.supabase && window.supabase.createClient) {
      // Back office (manager) sets window.ALPEXA_ADMIN_SESSION=true BEFORE this script
      // loads so its admin login lives in its OWN storage slot — isolated from every
      // customer app's session. One browser, one shared default key for customers, a
      // separate key for admin → signing in as admin never logs a customer out (and
      // vice-versa). Without the flag (all customer apps) the default key is used, so
      // they keep sharing one customer session as before.
      // Customer session lives in sessionStorage = PER-TAB (not shared across tabs), so two
      // different accounts can be open in two tabs of the same browser. Trade-off: a NEW tab
      // starts logged out (session isn't shared); refresh within a tab keeps it. (Money is
      // still server-only; this only moves the auth TOKEN's storage — CLAUDE.md #5 allows
      // session tokens client-side.) Falls back to default (localStorage) if sessionStorage
      // is unavailable. Admin keeps its own isolated localStorage key (back office is single).
      var perTab = null;
      try { if (window.sessionStorage) { window.sessionStorage.getItem('__probe'); perTab = window.sessionStorage; } } catch (e) { perTab = null; }
      var opts = window.ALPEXA_ADMIN_SESSION
        ? { auth: { storageKey: 'alpexa-admin-auth', persistSession: true, autoRefreshToken: true } }
        : (perTab ? { auth: { storage: perTab, persistSession: true, autoRefreshToken: true } } : undefined);
      db = window.supabase.createClient(URL, KEY, opts);
    }
  } catch (e) { db = null; }

  function rnd(p) { return p + '-' + Math.floor(100000 + Math.random() * 900000); }

  // Who is using this device. Set at signup / login (writes alpexa.me). If it's missing
  // we return a throwaway in-memory placeholder so callers don't crash — but we NEVER
  // persist it. Persisting a fake "Guest" with random SP-/CR-/FX- numbers used to seed
  // demo accounts into localStorage that then lingered and leaked (CLAUDE.md #5). The
  // app's load guard redirects to login.html whenever a real alpexa.me is absent, so a
  // logged-in app always reads the real one here; this placeholder is just a safety net.
  function me() {
    var m = null;
    try { m = JSON.parse(localStorage.getItem('alpexa.me') || 'null'); } catch (e) {}
    if (!m || !m.accts) {
      var n = Math.floor(1000 + Math.random() * 9000);
      m = { custId: 'P-' + n, name: 'Guest ' + n, email: '',
            accts: { sports: rnd('SP'), crypto: rnd('CR'), fx: rnd('FX') } };
      // intentionally NOT persisted — no fake account is ever written to localStorage.
    }
    return m;
  }

  function acctFor(server) {
    var m = me(), s = (server || '').toLowerCase();
    if (s === 'live' || s === 'fx') return m.accts.fx;
    if (s === 'sports') return m.accts.sports;
    if (s === 'crypto') return m.accts.crypto;
    return m.accts.sports || m.custId;
  }

  // Push one local request object up to the server.
  function pushRequest(r) {
    if (!db || !r) return Promise.resolve({ skipped: true });
    var m = me();
    var row = {
      local_id: String(r.id),
      cust_id: m.custId, name: m.name, acct_no: acctFor(r.server),
      server: r.server || '', type: r.type || 'withdraw',
      amount: +r.amount || 0, fee: +r.fee || 0, net: +r.net || 0,
      asset: r.asset || '', network: r.network || '', address: r.address || '',
      from_label: r.from || '', to_label: r.to || '', status: r.status || 'pending'
    };
    return db.from('requests').insert(row).then(function (res) {
      if (res && res.error) console.warn('AlpexaSync push error', res.error.message);
      return res;
    }, function (e) { console.warn('AlpexaSync push failed', e); return { error: e }; });
  }

  // Back office: fetch every request from every customer.
  function pullAll() {
    if (!db) return Promise.resolve([]);
    return db.from('requests').select('*').order('created_at', { ascending: false })
      .then(function (r) { return (r && r.data) || []; }, function () { return []; });
  }

  // This device: fetch my requests (status + amounts) so the app can reconcile
  // both admin approvals and any amount the operator corrected.
  function pullMine() {
    if (!db) return Promise.resolve([]);
    var m = me();
    return db.from('requests').select('local_id,status,amount,net,fee,type,from_label,to_label,server').eq('cust_id', m.custId)
      .then(function (r) { return (r && r.data) || []; }, function () { return []; });
  }

  // Normalize a server label (FX/Crypto/Sports in any case) to a key.
  function normSrv(x) {
    x = (x || '').toString().toLowerCase();
    if (x === 'fx' || x === 'live') return 'live';
    if (x.indexOf('crypto') >= 0 || x === 'cr') return 'crypto';
    if (x.indexOf('sport') >= 0 || x === 'sp') return 'sports';
    return x;
  }

  // Cross-app transfers: the DESTINATION app calls this to find approved
  // transfers headed to its own server and credit itself exactly once. Each
  // applied leg is recorded in a shared ledger so no app double-credits and
  // re-opening the app doesn't re-apply. (Each app still debits its own source.)
  function pullIncomingTransfers(myServer) {
    if (!db) return Promise.resolve([]);
    var mine = normSrv(myServer);
    return pullMine().then(function (rows) {
      if (!rows || !rows.length) return [];
      var applied = {};
      try { applied = JSON.parse(localStorage.getItem('alpexa.appliedTransfers') || '{}') || {}; } catch (e) { applied = {}; }
      var got = [], changed = false;
      rows.forEach(function (r) {
        if ((r.type || '') !== 'transfer' || (r.status || '') !== 'approved') return;
        var amt = +r.amount || 0; if (!(amt > 0)) return;
        if (normSrv(r.to_label) === mine && !applied[r.local_id + ':in']) {
          got.push({ id: r.local_id, amount: amt, from: normSrv(r.from_label || r.server) });
          applied[r.local_id + ':in'] = 1; changed = true;
        }
      });
      if (changed) { try { localStorage.setItem('alpexa.appliedTransfers', JSON.stringify(applied)); } catch (e) {} }
      return got;
    }, function () { return []; });
  }

  // Back office: edit a request's fields (status/amount/address) and sync it.
  function updateRequest(localId, patch) {
    if (!db) return Promise.resolve({ skipped: true });
    var p = {}; if (patch.status != null) p.status = patch.status;
    if (patch.amount != null) p.amount = patch.amount;
    if (patch.net != null) p.net = patch.net;
    if (patch.address != null) p.address = patch.address;
    if (patch.status != null) p.decided_at = new Date().toISOString();
    return db.from('requests').update(p).eq('local_id', String(localId)).select()
      .then(function (res) { if (res && res.error) console.warn('updateRequest', res.error.message); return res; },
            function (e) { return { error: e }; });
  }

  // Back office: VOID a request (soft-delete). We never hard-delete deposit/
  // withdraw/transfer records — they're the audit trail. Mark status='voided'
  // so it's kept and excluded from approved-cash totals, but recoverable.
  function deleteRequest(localId) {
    if (!db) return Promise.resolve({ skipped: true });
    return db.from('requests').update({ status: 'voided', decided_at: new Date().toISOString() }).eq('local_id', String(localId)).select()
      .then(function (res) { if (res && res.error) console.warn('voidRequest', res.error.message); return res; },
            function (e) { return { error: e }; });
  }

  // Back office: approve / reject a request on the server.
  // NOTE: supabase-js only fires the request when .then() is attached, so we
  // must chain it here — otherwise the update is built but never sent.
  function setStatus(localId, status) {
    if (!db) return Promise.resolve({ skipped: true });
    return db.from('requests').update({ status: status, decided_at: new Date().toISOString() })
      .eq('local_id', String(localId)).select()
      .then(function (res) {
        if (res && res.error) console.warn('AlpexaSync setStatus error', res.error.message);
        return res;
      }, function (e) { console.warn('AlpexaSync setStatus failed', e); return { error: e }; });
  }

  // ── Internal crypto P2P transfer (#25) — REAL server money move (qty in crypto_holdings).
  //    Sender is the caller's own crypto account (server derives it from auth). p.qty is COIN
  //    UNITS (USDT qty == USD 1:1; other coins are coin units — the app converts USD→qty).
  //    Idempotent by p.ref. This is the source of truth; sendPayment() below is notify-only.
  function cryptoSendInternal(p) {
    if (!db) return Promise.resolve({ error: 'offline' });
    var ref = (p && p.ref) || ('csend-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
    return db.rpc('crypto_send_internal', {
      p_ref: ref,
      p_to_acct: String((p && p.to) || '').trim().toUpperCase(),
      p_asset: (p && p.asset) || 'USDT',
      p_qty: +((p && p.qty)) || 0
    }).then(function (r) { return (r && r.data) || (r && r.error ? { ok: false, error: (r.error.message || 'rpc error') } : { ok: false, error: 'no response' }); },
            function (e) { return { ok: false, error: (e && e.message) || 'rpc failed' }; });
  }

  // ── Peer-to-peer payment NOTIFICATION (no money — the recipient's "you received X" toast).
  //    The real coins move via cryptoSendInternal(); this row only carries the notification.
  function sendPayment(p) {
    if (!db) return Promise.resolve({ error: 'offline' });
    var m = me();
    var row = {
      local_id: 'pay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      from_cust: m.custId, from_name: m.name,
      to_acct: String((p && p.to) || '').trim().toUpperCase(),
      amount: +((p && p.amount)) || 0, asset: (p && p.asset) || 'USDT',
      note: (p && p.note) || '', status: 'sent'
    };
    return db.from('payments').insert(row).select()
      .then(function (res) { if (res && res.error) console.warn('sendPayment', res.error.message); return res; },
            function (e) { return { error: e }; });
  }
  function pullIncoming() {
    if (!db) return Promise.resolve([]);
    var m = me(); var a = m.accts || {};
    var accts = [a.crypto, a.fx, a.sports, m.custId].filter(Boolean).map(function (x) { return String(x).toUpperCase(); });
    if (!accts.length) return Promise.resolve([]);
    return db.from('payments').select('*').eq('status', 'sent').in('to_acct', accts)
      .then(function (r) { return (r && r.data) || []; }, function () { return []; });
  }
  // Atomic claim: only flips a row that is STILL 'sent', and returns the claimed
  // rows. The winner gets a non-empty array; a device that lost the race gets []
  // — so the caller must credit ONLY when this returns rows (prevents P2P
  // double-credit, since P2P has no server-side balance movement).
  function claimPayment(localId) {
    if (!db) return Promise.resolve([]);
    return db.from('payments').update({ status: 'claimed', claimed_at: new Date().toISOString() })
      .eq('local_id', String(localId)).eq('status', 'sent').select('local_id')
      .then(function (x) { return (x && x.data) || []; }, function () { return []; });
  }

  // Server-authoritative balances: fetch THIS user's current per-server balances
  // straight from the accounts table. Apps poll this (on load / focus / timer) so
  // every device converges to the server's value — no logout/login needed.
  function pullBalances() {
    if (!db) return Promise.resolve(null);
    var m = me(); var a = m.accts || {};
    var nums = [a.fx, a.crypto, a.sports].filter(Boolean).map(function (x) { return String(x).toUpperCase(); });
    if (!nums.length) return Promise.resolve(null);
    var fxAcct = a.fx ? String(a.fx).toUpperCase() : null;
    return db.from('accounts').select('server,acct_no,balance').in('acct_no', nums)
      .then(function (r) {
        if (!r || !r.data) return null;
        var out = {};
        r.data.forEach(function (x) { if (x && x.server) out[x.server] = +x.balance || 0; });
        // FX equity (server-side) = cash balance + Σ floating P/L of OPEN fx positions.
        // The FX app writes each open position's live pnl to `positions` every ~3s, so
        // this reflects unrealised P/L without re-doing the lot/FX math here. We publish
        // it to localStorage('alpexa.fxEquity') so the Crypto app shows equity (not raw
        // cash) for FX in the dropdown / Accounts / withdraw / transfer — cross-device.
        if (!fxAcct || out.fx == null) return out;
        return db.from('positions').select('pnl').eq('acct_no', fxAcct).eq('server', 'fx').eq('status', 'open')
          .then(function (pr) {
            var sum = 0; if (pr && pr.data) pr.data.forEach(function (p) { sum += (+p.pnl || 0); });
            out.fxEquity = (+out.fx || 0) + sum;
            try { localStorage.setItem('alpexa.fxEquity', String(out.fxEquity)); } catch (e) {}
            return out;
          }, function () { return out; });
      }, function () { return null; });
  }

  // Activity log: every customer action (buy/sell/stake/bet/deposit…) so the back
  // office can see each customer's full history. Fire-and-forget; never blocks the UI.
  function logActivity(r) {
    if (!db || !r) return Promise.resolve({ skipped: true });
    var m = me();
    var row = {
      cust_id: m.custId,
      server: (r.server || '').toString().toLowerCase(),
      kind: r.kind || '',
      symbol: r.symbol || r.asset || '',
      amount: Math.round((+r.amount || 0) * 100) / 100,
      detail: (r.detail || '').toString().slice(0, 240),
      ticket: r.ticket ? String(r.ticket) : ''
    };
    return db.from('activity').insert(row).then(function (res) { return res; },
      function (e) { return { error: e }; });
  }

  // ── Per-customer cross-device data (user_data table): whitelist, recurring buys,
  //    beneficiaries. Best-effort; null/no-op if the table/session isn't there. ──
  function loadUserData(key) {
    if (!db) return Promise.resolve(null);
    var m = me(); if (!m || !m.custId) return Promise.resolve(null);
    return db.from('user_data').select('data').eq('cust_id', m.custId).eq('key', key).maybeSingle()
      .then(function (r) { return (r && r.data && r.data.data) || null; }, function () { return null; });
  }
  function saveUserData(key, data) {
    if (!db) return Promise.resolve();
    var m = me(); if (!m || !m.custId) return Promise.resolve();
    return db.from('user_data').upsert({ cust_id: m.custId, key: key, data: data, updated_at: new Date().toISOString() }, { onConflict: 'cust_id,key' })
      .then(function (r) { return r; }, function () {});
  }

  // IDENTITY GUARD — a customer app may only show/transact the account whose OWNER's
  // auth_id equals the current session uid. The display identity (alpexa.me) and the
  // Supabase auth session can drift apart (e.g. an admin session bleeding into the
  // browser): the app then reads another account via admin RLS but the server rejects
  // every money move ("not your account") — confusing AND it let the old client bet
  // bypass write a free bet. This forces a clean re-login on a CONFIRMED mismatch, so
  // you can never act on an account you aren't authenticated as. Conservative: it only
  // redirects when a player row for this uid EXISTS and its cust_id differs from the
  // displayed one — query errors / offline / no-row never lock the user out.
  function assertIdentity() {
    try {
      if (!db || !db.auth) return;
      var m = null; try { m = JSON.parse(localStorage.getItem('alpexa.me') || 'null'); } catch (e) { return; }
      if (!(m && m.custId)) return;
      if (sessionStorage.getItem('alpexa.idChecked')) return; // per-tab: prevents redirect loops
      db.auth.getUser().then(function (r) {
        var uid = r && r.data && r.data.user && r.data.user.id;
        if (!uid) return; // no session → the expired-session guard handles it
        db.from('players').select('cust_id').eq('auth_id', uid).maybeSingle().then(function (rr) {
          if (rr && !rr.error && rr.data && rr.data.cust_id && rr.data.cust_id !== m.custId) {
            sessionStorage.setItem('alpexa.idChecked', '1'); // set BEFORE redirect → cannot loop
            try { localStorage.removeItem('alpexa.me'); } catch (e) {}
            location.replace('login.html?switch=1');
          }
        }, function () {});
      }, function () {});
    } catch (e) {}
  }

  // IDLE AUTO-LOGOUT — like banking apps. After a window of NO interaction the customer
  // session is signed out and the app returns to the login form (same flow as the manual
  // "Sign out": auth.signOut() → login.html?switch=1, so it never auto-bounces back in).
  // Per-tab (session lives in sessionStorage), so only the inactive tab is affected. The
  // back office (admin sets ALPEXA_ADMIN_SESSION) is skipped — it has its own login surface.
  // Default 15 min idle + 30 s warning; back office can tune via window.__alpexaCtrl.idleMin.
  // This touches the auth SESSION only — no money/balance logic — and money stays server-only.
  function startIdleLogout() {
    try {
      if (window.ALPEXA_ADMIN_SESSION) return;        // admin handled separately
      if (window.__alpexaIdleStarted) return;         // once per page
      window.__alpexaIdleStarted = true;
      var IDLE_MIN = 15, WARN_SEC = 30;
      try { var c = window.__alpexaCtrl && window.__alpexaCtrl.idleMin; if (c != null && +c > 0) IDLE_MIN = +c; } catch (e) {}
      var IDLE_MS = IDLE_MIN * 60000, WARN_MS = WARN_SEC * 1000;
      var last = Date.now(), overlay = null, secEl = null, timer = null;

      function onActivity() { last = Date.now(); if (overlay) hideWarning(); }
      function hideWarning() { if (overlay) { try { overlay.remove(); } catch (e) {} } overlay = null; secEl = null; }
      function logout() {
        hideWarning();
        if (timer) { clearInterval(timer); timer = null; }
        try { if (db && db.auth) db.auth.signOut(); } catch (e) {}
        try { location.replace('login.html?switch=1&idle=1'); } catch (e) { try { location.href = 'login.html?switch=1&idle=1'; } catch (_) {} }
      }
      function showWarning() {
        if (overlay || !document.body) return;
        overlay = document.createElement('div');
        overlay.setAttribute('role', 'alertdialog');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(8,12,20,.55);display:flex;align-items:center;justify-content:center;padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;';
        overlay.innerHTML = '<div style="max-width:340px;width:100%;background:#fff;border-radius:18px;padding:24px 22px;box-shadow:0 20px 60px rgba(0,0,0,.35);text-align:center;">' +
          '<div style="width:48px;height:48px;border-radius:50%;background:#eef1fe;color:#2742C9;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">' +
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>' +
          '<div style="font-size:17px;font-weight:800;color:#0b0d12;letter-spacing:-.2px;">Still there?</div>' +
          '<div style="font-size:13.5px;color:#6b7686;margin-top:8px;line-height:1.5;">For your security you\'ll be signed out in <b id="alpexaIdleSec" style="color:#2742C9;">' + Math.ceil(WARN_MS / 1000) + '</b>s.</div>' +
          '<button id="alpexaIdleStay" style="margin-top:18px;width:100%;background:#2742C9;color:#fff;border:none;border-radius:12px;padding:14px 0;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;">Stay logged in</button>' +
          '<button id="alpexaIdleOut" style="margin-top:8px;width:100%;background:transparent;color:#8a94a6;border:none;border-radius:12px;padding:10px 0;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Sign out now</button>' +
        '</div>';
        document.body.appendChild(overlay);
        secEl = document.getElementById('alpexaIdleSec');
        // Stay must beat the activity-cancel race: stopPropagation so the click doesn't also count as generic activity timing
        document.getElementById('alpexaIdleStay').addEventListener('click', function (e) { e.stopPropagation(); onActivity(); });
        document.getElementById('alpexaIdleOut').addEventListener('click', function (e) { e.stopPropagation(); logout(); });
      }

      timer = setInterval(function () {
        var idle = Date.now() - last;
        if (idle >= IDLE_MS) { logout(); return; }
        if (idle >= IDLE_MS - WARN_MS) {
          if (!overlay) showWarning();
          if (secEl) secEl.textContent = Math.max(0, Math.ceil((IDLE_MS - idle) / 1000));
        }
      }, 1000);

      ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'touchmove', 'click', 'wheel']
        .forEach(function (ev) { window.addEventListener(ev, onActivity, { passive: true, capture: true }); });
      // Returning to the app is NOT "activity" (do not reset the clock). Mobile browsers
      // throttle/pause timers while backgrounded, so the interval can't count down with the
      // screen off; instead, on every resume we check the REAL elapsed time and sign out
      // immediately if it already exceeded the limit (banking-app behavior). If we're still
      // within the window, the resumed interval keeps counting and a real touch resets it.
      function checkOnResume() {
        if (document.hidden) return;
        var idle = Date.now() - last;
        if (idle >= IDLE_MS) { logout(); }
        else if (idle >= IDLE_MS - WARN_MS && !overlay) { showWarning(); }
      }
      document.addEventListener('visibilitychange', checkOnResume);
      window.addEventListener('focus', checkOnResume);
      window.addEventListener('pageshow', checkOnResume);
    } catch (e) {}
  }
  try { startIdleLogout(); } catch (e) {}

  return { db: db, me: me, acctFor: acctFor, pushRequest: pushRequest,
           pullAll: pullAll, pullMine: pullMine, setStatus: setStatus,
           updateRequest: updateRequest, deleteRequest: deleteRequest,
           sendPayment: sendPayment, cryptoSendInternal: cryptoSendInternal,
           pullIncoming: pullIncoming, claimPayment: claimPayment,
           pullIncomingTransfers: pullIncomingTransfers, normSrv: normSrv,
           logActivity: logActivity, pullBalances: pullBalances,
           loadUserData: loadUserData, saveUserData: saveUserData,
           assertIdentity: assertIdentity, startIdleLogout: startIdleLogout };
})();
