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

function publicFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT }).toString('utf8');
  return out.split('\0').filter(Boolean).filter((f) => {
    if (EXCLUDE_TOP.has(f.split('/')[0])) return false;
    if (EXCLUDE_EXT.test(f)) return false;
    return fs.existsSync(path.join(ROOT, f));   // 작업트리에서 지운 파일은 건너뜀
  });
}

module.exports = { publicFiles, EXCLUDE_TOP, EXCLUDE_EXT };

if (require.main === module) {
  const dest = path.resolve(ROOT, process.argv[2] || '_site');
  fs.rmSync(dest, { recursive: true, force: true });
  const files = publicFiles();
  for (const f of files) {
    const to = path.join(dest, f);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), to);
  }
  console.log(`site bundle → ${path.relative(ROOT, dest) || dest}: ${files.length} files`);
}
