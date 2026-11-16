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
function retiredStubs() {
  const out = {};
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

function publicFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT }).toString('utf8');
  return out.split('\0').filter(Boolean).filter((f) => {
    if (EXCLUDE_TOP.has(f.split('/')[0])) return false;
    if (EXCLUDE_EXT.test(f)) return false;
    if (RETIRED_PAGES[f] || RETIRED_ASSETS.has(f)) return false;
    return fs.existsSync(path.join(ROOT, f));   // 작업트리에서 지운 파일은 건너뜀
  });
}

module.exports = { publicFiles, retiredStubs, EXCLUDE_TOP, EXCLUDE_EXT, RETIRED_PAGES, RETIRED_ASSETS };

if (require.main === module) {
  const dest = path.resolve(ROOT, process.argv[2] || '_site');
  fs.rmSync(dest, { recursive: true, force: true });
  const files = publicFiles();
  for (const f of files) {
    const to = path.join(dest, f);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), to);
  }
  const stubs = retiredStubs();
  for (const [page, html] of Object.entries(stubs)) fs.writeFileSync(path.join(dest, page), html);
  console.log(`site bundle → ${path.relative(ROOT, dest) || dest}: ${files.length} files + ${Object.keys(stubs).length} moved-page stub(s)`);
}
