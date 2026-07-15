// Alpexa — render a daily report object (from report-engine.js) into an email-safe HTML
// document. Inline styles only (email clients strip <style>/external CSS), table layout.
'use strict';
const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function card(title, rows, accent) {
  const trs = rows.map(([k, v]) => `<tr>
      <td style="padding:6px 0;color:#5a6478;font:14px -apple-system,Segoe UI,Roboto,sans-serif">${k}</td>
      <td style="padding:6px 0;text-align:right;font:700 14px -apple-system,Segoe UI,Roboto,sans-serif;color:#0e1726">${v}</td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e7ebf2;border-left:4px solid ${accent};border-radius:10px;margin:0 0 14px;padding:14px 18px">
    <tr><td style="font:800 15px -apple-system,Segoe UI,Roboto,sans-serif;color:#0e1726;padding-bottom:6px">${title}</td></tr>
    <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${trs}</table></td></tr>
  </table>`;
}

function renderReportHTML(r) {
  const s = r.sports, c = r.crypto, f = r.fx, sec = r.security;
  const passBadge = sec.pass
    ? '<span style="background:#e7f7ec;color:#16a34a;padding:4px 12px;border-radius:999px;font:700 13px sans-serif">✅ 무결성 PASS (오차 0)</span>'
    : `<span style="background:#fdecea;color:#e5484d;padding:4px 12px;border-radius:999px;font:700 13px sans-serif">🚨 오차 ${sec.mismatchTotal}건 — 즉시 확인</span>`;
  const hv = sec.highValueAlerts && sec.highValueAlerts.length
    ? `<table role="presentation" width="100%" style="margin:0 0 14px"><tr><td style="background:#fff8e6;border:1px solid #f0d48a;border-radius:10px;padding:12px 16px;font:13px sans-serif;color:#8a6d0f">⚠️ <b>고액 거래 경고 (${sec.highValueAlerts.length}건):</b> ${sec.highValueAlerts.map(a => `${a.domain}/${a.cust} ${money(a.amount)}`).join(' · ')}</td></tr></table>`
    : '';
  const mismatchBlock = (!sec.pass && sec.mismatches.length)
    ? `<table role="presentation" width="100%" style="margin:0 0 14px"><tr><td style="background:#fdecea;border:1px solid #f1b0b7;border-radius:10px;padding:12px 16px;font:12px monospace;color:#c0392b">${JSON.stringify(sec.mismatches)}</td></tr></table>`
    : '';

  return `<!doctype html><html><body style="margin:0;background:#f4f6fb;padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 0 18px">
      <div style="font:900 22px -apple-system,Segoe UI,Roboto,sans-serif;color:#1e40d8">ALPEXA <span style="color:#0e1726;font-weight:800">일일 정산 리포트</span></div>
      <div style="font:14px sans-serif;color:#5a6478;margin-top:4px">${r.generated_at} · ${passBadge}</div>
    </td></tr>
    <tr><td>${mismatchBlock}${hv}
      ${card('🏈 스포츠', [['총 배팅액', money(s.totalStake)], ['지급 당첨금', money(s.totalPayout)], ['하우스 수익', money(s.houseProfit)], ['베팅 건수', s.count]], '#1e40d8')}
      ${card('🪙 크립토', [['총 거래 대금', money(c.tradeVolume)], ['거래 수수료 수익', money(c.feeRevenue)], ['거래 건수', c.count]], '#f59e0b')}
      ${card('💱 FX', [['총 랏(마진 거래량)', f.lotVolume], ['스프레드 수익', money(f.spreadRevenue)], ['스왑 합계', money(f.swapTotal)], ['강제 청산', f.liquidations + '건']], '#16a34a')}
      ${card('🔒 보안 / 무결성', [['잔고 대조 오차', sec.mismatchTotal + '건'], ['고액 거래 경고', (sec.highValueAlerts || []).length + '건'], ['종합 판정', sec.pass ? 'PASS' : 'REVIEW']], sec.pass ? '#16a34a' : '#e5484d')}
    </td></tr>
    <tr><td style="padding:8px 0;font:12px sans-serif;color:#8a94a6;text-align:center">Alpexa 자동 정산 시스템 · 이 메일은 매일 자동 발송됩니다</td></tr>
  </table></td></tr></table></body></html>`;
}

module.exports = { renderReportHTML };
