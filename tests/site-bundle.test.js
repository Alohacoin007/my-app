#!/usr/bin/env node
// Alpexa — 공개 사이트 묶음 핀 (2026-10-01)
// tools/build-site.js 가 고르는 파일 목록에 대해:
//   S1 내부 파일(CLAUDE.md·결함-로그·SQL·Edge 소스·tests·.claude·워크플로)이 하나도 없다.
//   S2 공개 페이지(html/js/json/css)가 참조하는 로컬 파일 중 리포에 있는 것은 전부 묶음에도 있다
//      (빼는 규칙이 화면 파일을 잘못 빼서 404 가 나는 걸 배포 전에 잡는다).
//   S3 deploy.yml 이 리포 전체('.')가 아니라 묶음을 올린다.
// 실행: node tests/site-bundle.test.js   (verify 게이트 자동 포함)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const { publicFiles } = require('../tools/build-site.js');

let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

let tracked;
try { tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: ROOT }).toString('utf8').split('\0').filter(Boolean)); }
catch (e) { console.log('⚪ git 없음 — site-bundle 핀 생략'); process.exit(0); }
const pub = publicFiles();
const pubSet = new Set(pub);

// ── S1 ──
const INTERNAL = /(^|\/)(CLAUDE\.md|결함-로그\.md)$|\.(md|sql|ts|py)$|^(tests|supabase|scripts|reports|tools|\.claude|\.github|\.githooks|samples|node_modules)\//;
for (const f of pub) if (INTERNAL.test(f)) bad(`내부 파일이 공개 묶음에 있다: ${f}`);
for (const must of ['index.html', 'login.html', 'fx-app.html', 'webtrade.html', 'crypto-live.html', 'sports-live.html', 'CNAME', 'sw.js', 'alpexa-sync.js'])
  if (!pubSet.has(must)) bad(`필수 화면 파일이 묶음에 없다: ${must}`);

// ── S2 ──
const REF = /(?:src|href)\s*=\s*["']([^"'#?]+)|(?:import|fetch|importScripts|register)\(\s*["']([^"'#?]+)|url\(\s*["']?([^"')#?]+)/g;
let checked = 0;
for (const f of pub) {
  if (!/\.(html|js|css|json)$/.test(f) || f.startsWith('vendor/')) continue;
  const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
  let m;
  while ((m = REF.exec(txt))) {
    const ref = (m[1] || m[2] || m[3] || '').trim();
    if (!ref || /^(https?:|data:|mailto:|tel:|javascript:|blob:|\/\/|\$|\{)/.test(ref) || ref.includes('${') || ref.includes('+')) continue;
    const target = path.posix.normalize(ref.startsWith('/') ? ref.slice(1) : path.posix.join(path.posix.dirname(f), ref));
    if (!tracked.has(target)) continue;              // 리포에 없는 경로는 이 핀의 관심 밖 (런타임 생성·외부)
    checked++;
    if (!pubSet.has(target)) bad(`${f} 가 참조하는 ${target} 이 공개 묶음에서 빠졌다 → 배포 후 404`);
  }
}

// ── S3 ──
const dep = fs.readFileSync(path.join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
if (/path:\s*['"]?\.['"]?\s*}/.test(dep)) bad("deploy.yml 이 리포 전체(path: '.')를 올린다 — _site 묶음만 올려야 한다");
if (!/node tools\/build-site\.js/.test(dep) || !/path:\s*['"]?_site/.test(dep)) bad('deploy.yml 이 tools/build-site.js → _site 를 올리지 않는다');
const iV = dep.indexOf('node tests/verify.js'), iB = dep.indexOf('node tools/build-site.js');
if (iV < 0 || iB < 0 || iV > iB) bad('verify 게이트가 묶음 생성보다 앞에 있어야 한다');

if (fail) { console.error(`\n🔴 FAIL — ${fail}건.`); process.exit(1); }
console.log(`🟢 PASS: 공개 묶음 ${pub.length}/${tracked.size} 파일 · 내부 파일 0 · 로컬 참조 ${checked}건 전부 포함 · deploy.yml = _site.`);
