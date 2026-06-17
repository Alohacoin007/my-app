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
    if (window.supabase && window.supabase.createClient) db = window.supabase.createClient(URL, KEY);
  } catch (e) { db = null; }

  function rnd(p) { return p + '-' + Math.floor(100000 + Math.random() * 900000); }

  // Who is using this device. Set at signup; falls back to a demo guest.
  function me() {
    var m = null;
    try { m = JSON.parse(localStorage.getItem('alpexa.me') || 'null'); } catch (e) {}
    if (!m || !m.accts) {
      var n = Math.floor(1000 + Math.random() * 9000);
      m = { custId: 'P-' + n, name: 'Guest ' + n, email: '',
            accts: { sports: rnd('SP'), crypto: rnd('CR'), fx: rnd('FX') } };
      try { localStorage.setItem('alpexa.me', JSON.stringify(m)); } catch (e) {}
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

  // ── Peer-to-peer payments (internal users send crypto to each other) ──
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
  function claimPayment(localId) {
    if (!db) return Promise.resolve();
    return db.from('payments').update({ status: 'claimed', claimed_at: new Date().toISOString() })
      .eq('local_id', String(localId)).then(function (x) { return x; }, function () {});
  }

  // Server-authoritative balances: fetch THIS user's current per-server balances
  // straight from the accounts table. Apps poll this (on load / focus / timer) so
  // every device converges to the server's value — no logout/login needed.
  function pullBalances() {
    if (!db) return Promise.resolve(null);
    var m = me(); var a = m.accts || {};
    var nums = [a.fx, a.crypto, a.sports].filter(Boolean).map(function (x) { return String(x).toUpperCase(); });
    if (!nums.length) return Promise.resolve(null);
    return db.from('accounts').select('server,acct_no,balance').in('acct_no', nums)
      .then(function (r) {
        if (!r || !r.data) return null;
        var out = {};
        r.data.forEach(function (x) { if (x && x.server) out[x.server] = +x.balance || 0; });
        return out; // e.g. { fx: 0, crypto: 0, sports: 100 }
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

  return { db: db, me: me, acctFor: acctFor, pushRequest: pushRequest,
           pullAll: pullAll, pullMine: pullMine, setStatus: setStatus,
           updateRequest: updateRequest, deleteRequest: deleteRequest,
           sendPayment: sendPayment, pullIncoming: pullIncoming, claimPayment: claimPayment,
           pullIncomingTransfers: pullIncomingTransfers, normSrv: normSrv,
           logActivity: logActivity, pullBalances: pullBalances };
})();
