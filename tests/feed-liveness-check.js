#!/usr/bin/env node
// Alpexa — 시세 라이브니스 프로브 (결함-로그 2026-07-19 "sticky wsLive 얼어붙음"의 상시 감시탑)
//
// 무엇을 잡나: "값은 떠 있는데 안 움직인다" — 코드가 멀쩡해 보여도 런타임에 피드가 죽은 상태.
// 어떻게: 라이브 사이트를 헤드리스로 띄워 실제 화면의 시세 셀을 관찰창(20s) 동안 샘플링,
//         (1) 몇 행이나 실제로 바뀌었나 (2) 마지막 실틱 나이(mk.lastTick)를 실측한다.
//
// 실행: node tests/feed-liveness-check.js [--url https://alpexa-sports.com] [--window 20]
//  · 네트워크 필요 (크론/GitHub Action/사장님 PC). 세션 샌드박스 프록시에선 NETWORK BLOCKED로 실패 — 정상.
//  · 크립토 = 24/7이라 항상 움직여야 함(안 움직이면 🔴).
//  · FX(webtrade)는 주말(토·일) 휴장이라 주말엔 자동 스킵(오탐 방지).
// 종료코드: 0=전부 초록 · 1=얼어붙음/네트워크 불능 (Action 실패 → 이메일 = 침묵 게이트)
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = (argOf('--url', 'https://alpexa-sports.com')).replace(/\/$/, '');
const WINDOW_S = +argOf('--window', 20);

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base).filter(x => /chromium/.test(x)))
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const f = path.join(base, d, c); if (fs.existsSync(f)) return f;
      }
  } catch (_) {}
  return null;
}
let chromium = null;
try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
if (!chromium) { try { chromium = require('playwright-core').chromium; } catch (_) {} }
if (!chromium) { console.error('🔴 playwright-core not available'); process.exit(1); }

let fail = 0;
const report = (name, okFlag, detail) => {
  console.log('  ' + (okFlag ? '✅' : '🔴') + ' ' + name + (detail ? '  — ' + detail : ''));
  if (!okFlag) fail++;
};

async function probeCrypto(browser) {
  // 크립토 대시보드 — Markets 행(bid 셀) 움직임 + mk.lastTick 신선도
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  try {
    await page.goto(BASE + '/dev/crypto-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);   // 피드 워밍업 (WS 접속 or 첫 폴백 폴)
    const snap = () => page.$$eval('#mkList .mrow', rows =>
      rows.slice(0, 8).map(r => (r.dataset.sym || '') + ':' + r.textContent.replace(/\s+/g, '')));
    const t0 = await snap();
    if (!t0.length) { report('crypto: market rows render', false, 'no .mrow rows'); return; }
    await page.waitForTimeout(WINDOW_S * 1000);
    const t1 = await snap();
    let moved = 0; for (let i = 0; i < Math.min(t0.length, t1.length); i++) if (t0[i] !== t1[i]) moved++;
    /* mk는 top-level const(전역 lexical) — window.mk는 항상 undefined라 3연속 오탐(2026-07-19 실측).
       typeof 가드로 교정: 진짜 신선도를 읽고, 페이지 구조가 바뀌어 mk가 사라진 경우만 missing. */
    const tickAge = await page.evaluate(() =>
      (typeof mk !== 'undefined' && mk.lastTick) ? Math.round((Date.now() - mk.lastTick) / 1000) : null);
    // 크립토는 24/7 — 관찰창 동안 최소 2행은 움직여야 하고 마지막 실틱이 15s 이내여야 한다
    report('crypto: rows moving (' + moved + '/' + Math.min(t0.length, t1.length) + ' in ' + WINDOW_S + 's)', moved >= 2,
      moved < 2 ? 'FROZEN — t0=' + JSON.stringify(t0.slice(0, 3)) : '');
    report('crypto: last real tick fresh (' + tickAge + 's ago)', tickAge != null && tickAge <= 15,
      tickAge == null ? 'mk.lastTick missing' : '');
    // W4 차트 — 캔들이 실재하고 마지막 캔들 종가가 관찰창 동안 움직인다 (피드가 살아있는데 차트만 언 상태 검출)
    const chSnap = () => page.evaluate(() =>
      (typeof ch !== 'undefined' && ch.candles.length) ? ch.candles[ch.candles.length - 1].c : null);
    const c0 = await chSnap();
    if (c0 == null) report('crypto: W4 chart has candles', false, 'ch.candles empty (chLoad dead + heal not firing?)');
    else {
      await page.waitForTimeout(6000);   // 2s 라이브틱 스로틀 대비 여유
      const c1 = await chSnap();
      report('crypto: W4 chart last candle live (' + c0 + '→' + c1 + ')', c1 != null && c1 !== c0,
        c1 === c0 ? 'chart FROZEN while feed alive' : '');
    }
  } finally { await page.close(); }
}

async function probeFx(browser) {
  // FX(webtrade) — 주말 휴장 스킵 (라스베가스 기준으로도 토·일이면 시장 닫힘)
  const day = new Date().getUTCDay();   // 0=일, 6=토
  if (day === 0 || day === 6) { console.log('  ⏭️  fx: weekend — market closed, skipped'); return; }
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  try {
    await page.goto(BASE + '/webtrade.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(8000);
    const snap = () => page.evaluate(() => {
      const cells = document.querySelectorAll('[data-sym] .bid, .mw-bid, td.bid');
      if (cells.length) return [...cells].slice(0, 6).map(c => c.textContent.trim());
      return (document.body.textContent.match(/1\.\d{4,5}/g) || []).slice(0, 6);   // 폴백: EURUSD류 호가 텍스트
    });
    const t0 = await snap();
    if (!t0.length) { report('fx: quotes render', false, 'no quote cells found'); return; }
    await page.waitForTimeout(WINDOW_S * 1000);
    const t1 = await snap();
    const moved = t0.some((v, i) => v !== t1[i]);
    report('fx: quotes moving in ' + WINDOW_S + 's', moved, moved ? '' : 'FROZEN — ' + JSON.stringify(t0.slice(0, 3)));
  } finally { await page.close(); }
}

(async () => {
  console.log('── FEED LIVENESS — ' + BASE + ' (window ' + WINDOW_S + 's) ──');
  const exe = findChromium();
  const browser = await chromium.launch(Object.assign({ headless: true, args: ['--no-sandbox'] },
    exe ? { executablePath: exe } : {}));
  try {
    await probeCrypto(browser);
    await probeFx(browser);
  } catch (e) {
    report('network reachable', false, 'NETWORK BLOCKED or load failed: ' + e.message.slice(0, 120));
  } finally { await browser.close(); }
  console.log(fail ? '\n🔴 FEED LIVENESS FAILED — ' + fail + ' problem(s)' : '\n🟢 feeds live');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('🔴 liveness crashed: ' + e.message); process.exit(1); });
