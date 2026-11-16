#!/usr/bin/env node
// Alpexa — 공개 사이트 묶음 만들기 (2026-10-01, 사장님 "불필요한 것 정리" 1번)
// ============================================================================
// 왜: deploy.yml 이 리포 전체(path: '.')를 Pages 에 올려서 CLAUDE.md(테스트 계정·트리거 ID·
// 보안 메모)·결함-로그·supabase/sql·tests·.claude 까지 누구나 URL 로 읽을 수 있었다.
// 고객 화면에 필요한 파일만 _site/ 로 복사해 그것만 올린다.
//
// 규칙: **허용이 기본, 내부 폴더/문서만 뺀다** — 빼먹은 화면 파일이 404 가 되는 게 더 큰 사고라서.
//   대신 tests/site-bundle.test.js 가 (1) 내부 파일이 안 섞였는지 (2) 공개 페이지가 참조하는
//   로컬 파일이 전부 묶음 안에 있는지를 verify 게이트로 강제한다.
// 원본 = git 추적 파일만 (작업 중 흘린 임시 파일이 공개되지 않게).
//
// 실행: node tools/build-site.js [출력폴더=_site]
// ============================================================================
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

// 최상위에서 통째로 빼는 폴더·파일
const EXCLUDE_TOP = new Set([
  '.github', '.claude', '.githooks', 'tests', 'supabase', 'scripts', 'reports', 'tools',
  'samples', 'node_modules', 'package.json', 'package-lock.json', '.env.example',
  '.gitignore', 'twa-manifest.json', '_site',
]);
// 어디에 있든 빼는 것: 문서(.md)·서버 코드(.sql/.ts)·파이썬 빌드 스크립트
const EXCLUDE_EXT = /\.(md|sql|ts|py)$/i;

// 은퇴한 화면 (2026-11-16 정리 2단계 ⑤): 파일은 리포에 남기되(스프레드·계약 락스텝 테스트가 기준으로 읽는다)
// 공개 묶음에는 원본을 싣지 않는다. 그 주소엔 새 앱으로 보내는 쪽지를 넣어 즐겨찾기 고객이 404 를 보지 않게 한다.
// 기기 규칙은 login.html 의 FX 라우팅과 같다 (폰 → fx-app.html · PC → webtrade.html).
const RETIRED_PAGES = { 'trading.html': { mobile: 'fx-app.html', desktop: 'webtrade.html' } };
const RETIRED_ASSETS = new Set(['vendor/trading-compiled.js', 'src/trading-app.jsx']);
// 주소가 바뀐 화면 (2026-11-16 정리 3단계 ③): 옛 주소 → 새 주소 (옛 주소 기준 상대 경로). 주소 뒤 ?… #… 는 그대로 넘긴다.
const MOVED_PAGES = { 'dev/crypto-dashboard.html': '../crypto-dashboard.html' };
function retiredStubs() {
  const out = {};
  for (const [page, to] of Object.entries(MOVED_PAGES)) {
    out[page] = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Alpexa</title>
<script>location.replace('${to}'+location.search+location.hash);</script>
<noscript><meta http-equiv="refresh" content="0;url=${to}"></noscript></head>
<body style="background:#000;color:#8a97ac;font:14px -apple-system,Segoe UI,Roboto,sans-serif;padding:24px">
This page has moved. <a href="${to}" style="color:#6aa5e8">Open Alpexa Crypto</a></body></html>
`;
  }
  for (const [page, to] of Object.entries(RETIRED_PAGES)) {
    out[page] = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Alpexa</title>
<script>(function(){var m=/Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent||'');
location.replace(m?'${to.mobile}':'${to.desktop}');})();</script>
<noscript><meta http-equiv="refresh" content="0;url=${to.desktop}"></noscript></head>
<body style="background:#000;color:#8a97ac;font:14px -apple-system,Segoe UI,Roboto,sans-serif;padding:24px">
This page has moved. <a href="${to.mobile}" style="color:#6aa5e8">Open Alpexa FX</a></body></html>
`;
  }
  return out;
}

// 미리 컴파일해서 싣는 화면 (2026-11-16 정리 3단계 ②): 리포의 html 은 JSX 인라인 **원본 그대로** 두고
// (그 파일을 읽는 테스트·로컬 실행 무변경), 묶음을 만들 때만 JSX 블록을 컴파일해 별도 파일로 빼고 Babel 태그를 지운다.
// 고객 PC 가 3MB Babel 을 내려받아 그 자리에서 컴파일하던 것을 없앤다. 핀: tests/webtrade-precompiled.test.js
// 전제가 어긋나면 **던진다** (빌드 실패 = 배포 중단 · 옛 버전 유지) — 깨진 화면을 싣지 않는다.
const PRECOMPILED_PAGES = { 'webtrade.html': 'vendor/webtrade-compiled.js' };
const BABEL_BLOCK = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/g;
const BABEL_TAG = /[ \t]*<script[^>]*@babel\/standalone[^>]*><\/script>\n?/g;
function precompilePage(html, outPath) {
  const blocks = [...html.matchAll(BABEL_BLOCK)];
  if (blocks.length !== 1) throw new Error(`precompile: text/babel 블록이 ${blocks.length}개 (정확히 1개여야 한다)`);
  const tags = html.match(BABEL_TAG) || [];
  if (tags.length !== 1) throw new Error(`precompile: Babel 스크립트 태그가 ${tags.length}개 (정확히 1개여야 한다)`);
  const { compile } = require('./precompile-jsx.js');          // 브라우저가 쓰던 것과 같은 변환 (react 프리셋 · sourceType script)
  const js = `// ⚠️ 생성 파일 — 원본: ${path.basename(outPath).replace('-compiled.js', '.html')} 의 JSX 블록 → tools/build-site.js\n` + compile(blocks[0][1]) + '\n';
  new (require('vm').Script)(js);                               // 컴파일 결과가 일반 자바스크립트인지 한 번 더 확인
  const hash = require('crypto').createHash('sha1').update(js).digest('hex').slice(0, 8);
  const out = html.replace(BABEL_TAG, '').replace(BABEL_BLOCK, () => `<script defer src="${outPath}?v=${hash}"></script>`);
  return { html: out, js, hash };
}

function publicFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT }).toString('utf8');
  return out.split('\0').filter(Boolean).filter((f) => {
    if (EXCLUDE_TOP.has(f.split('/')[0])) return false;
    if (EXCLUDE_EXT.test(f)) return false;
    if (RETIRED_PAGES[f] || RETIRED_ASSETS.has(f)) return false;
    return fs.existsSync(path.join(ROOT, f));   // 작업트리에서 지운 파일은 건너뜀
  });
}

module.exports = { publicFiles, retiredStubs, EXCLUDE_TOP, EXCLUDE_EXT, RETIRED_PAGES, RETIRED_ASSETS, MOVED_PAGES, PRECOMPILED_PAGES, precompilePage };

if (require.main === module) {
  const dest = path.resolve(ROOT, process.argv[2] || '_site');
  fs.rmSync(dest, { recursive: true, force: true });
  const files = publicFiles();
  for (const f of files) {
    const to = path.join(dest, f);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (PRECOMPILED_PAGES[f]) {
      const r = precompilePage(fs.readFileSync(path.join(ROOT, f), 'utf8'), PRECOMPILED_PAGES[f]);   // 실패하면 던진다 → 빌드 실패
      fs.writeFileSync(to, r.html);
      const jsTo = path.join(dest, PRECOMPILED_PAGES[f]);
      fs.mkdirSync(path.dirname(jsTo), { recursive: true });
      fs.writeFileSync(jsTo, r.js);
      console.log(`precompiled ${f} → ${PRECOMPILED_PAGES[f]} (${Math.round(r.js.length / 1024)}KB, v=${r.hash})`);
      continue;
    }
    fs.copyFileSync(path.join(ROOT, f), to);
  }
  const stubs = retiredStubs();
  for (const [page, html] of Object.entries(stubs)) { fs.mkdirSync(path.dirname(path.join(dest, page)), { recursive: true }); fs.writeFileSync(path.join(dest, page), html); }
  console.log(`site bundle → ${path.relative(ROOT, dest) || dest}: ${files.length} files + ${Object.keys(stubs).length} moved-page stub(s)`);
}
