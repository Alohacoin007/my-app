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

  // This device: fetch just my requests' statuses (id + status) to reconcile.
  function pullMine() {
    if (!db) return Promise.resolve([]);
    var m = me();
    return db.from('requests').select('local_id,status').eq('cust_id', m.custId)
      .then(function (r) { return (r && r.data) || []; }, function () { return []; });
  }

  // Back office: approve / reject a request on the server.
  // NOTE: supabase-js only fires the request when .then() is attached, so we
  // must chain it here — otherwise the update is built but never sent.
  function setStatus(localId, status) {
    if (!db) return Promise.resolve({ skipped: true });
    return db.from('requests').update({ status: status, decided_at: new Date().toISOString() })
      .eq('local_id', String(localId))
      .then(function (res) {
        if (res && res.error) console.warn('AlpexaSync setStatus error', res.error.message);
        return res;
      }, function (e) { console.warn('AlpexaSync setStatus failed', e); return { error: e }; });
  }

  return { db: db, me: me, acctFor: acctFor, pushRequest: pushRequest,
           pullAll: pullAll, pullMine: pullMine, setStatus: setStatus };
})();
