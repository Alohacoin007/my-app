// Alpexa — NYSE 세션 달력 (2026-09-07 노동절 오탐에서 나옴)
// ============================================================================
// "지금 미국 주식 시장이 열려 있나?" 를 뉴욕 현지시간으로 답한다.
//   · 평일 09:30~16:00 ET (검사 창은 09:35~15:55 — 개장/폐장 직후 요동 제외)
//   · 휴장일은 **규칙**으로 계산한다 (날짜 하드코딩은 내년에 썩는다)
//   · 조기폐장일(13:00 ET)은 13:00 이후를 장외로 본다
//   · 서머타임은 Intl 의 America/New_York 이 처리한다 — UTC 고정 창 금지
//
// 규칙 출처: NYSE 휴장일 규정.
//   신정 1/1 · MLK 1월 셋째 월 · 대통령의 날 2월 셋째 월 · 성금요일 · 현충일 5월 마지막 월 ·
//   준틴스 6/19 · 독립기념일 7/4 · 노동절 9월 첫째 월 · 추수감사절 11월 넷째 목 · 성탄절 12/25.
//   고정일이 토요일이면 금요일, 일요일이면 월요일에 관측. 단 **신정이 토요일이면 전날(12/31)
//   휴장 없음** (NYSE 특칙). 조기폐장: 7/3(평일) · 추수감사절 다음날 · 12/24(평일).
//
// 의존성 0 · 네트워크 0 · 순수 함수. 자가검진과 테스트가 같은 함수를 쓴다.
'use strict';

// 뉴욕 현지 시각 분해 (서머타임 포함). Intl 은 Node 내장이라 별도 설치 없음.
function nyParts(date) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday];
  return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour % 24, mm: +o.minute, dow };
}

// 그 달의 n번째 특정 요일 (n<0 이면 마지막)
function nthWeekday(y, m, dow, n) {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return 1 + ((dow - first + 7) % 7) + (n - 1) * 7;
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
  return lastDay - ((last - dow + 7) % 7);
}

// 부활절 (그레고리력, Anonymous 알고리즘) → [월, 일]
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

const dowOf = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const key = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// 고정일 휴장의 관측일. 토→금, 일→월. 신정 토요일은 관측 없음(null).
function observed(y, m, d, { noSatShift = false } = {}) {
  const w = dowOf(y, m, d);
  if (w === 6) return noSatShift ? null : [m, d - 1];
  if (w === 0) return [m, d + 1];
  return [m, d];
}

// 해당 연도의 휴장일 집합과 조기폐장일 집합 (키 'YYYY-MM-DD')
function yearCalendar(y) {
  const closed = new Set(), early = new Set();
  const add = (set, md) => { if (md) set.add(key(y, md[0], md[1])); };

  add(closed, observed(y, 1, 1, { noSatShift: true }));              // 신정 (토요일이면 12/31 휴장 없음)
  add(closed, [1, nthWeekday(y, 1, 1, 3)]);                          // MLK
  add(closed, [2, nthWeekday(y, 2, 1, 3)]);                          // 대통령의 날
  const [em, ed] = easter(y);                                        // 성금요일 = 부활절 -2일
  const gf = new Date(Date.UTC(y, em - 1, ed - 2));
  add(closed, [gf.getUTCMonth() + 1, gf.getUTCDate()]);
  add(closed, [5, nthWeekday(y, 5, 1, -1)]);                         // 현충일
  add(closed, observed(y, 6, 19));                                   // 준틴스
  add(closed, observed(y, 7, 4));                                    // 독립기념일
  add(closed, [9, nthWeekday(y, 9, 1, 1)]);                          // 노동절
  const tg = nthWeekday(y, 11, 4, 4);                                // 추수감사절
  add(closed, [11, tg]);
  add(closed, observed(y, 12, 25));                                  // 성탄절

  // 조기폐장 13:00 ET — 그날이 이미 휴장이면 의미 없음
  add(early, [11, tg + 1]);                                          // 추수감사절 다음날
  if (dowOf(y, 7, 3) >= 1 && dowOf(y, 7, 3) <= 5) add(early, [7, 3]);   // 7/3 평일
  if (dowOf(y, 12, 24) >= 1 && dowOf(y, 12, 24) <= 5) add(early, [12, 24]); // 12/24 평일
  for (const k of early) if (closed.has(k)) early.delete(k);
  return { closed, early };
}

const _cache = {};
function calendarFor(y) { return _cache[y] || (_cache[y] = yearCalendar(y)); }

// 핵심: 이 시각에 시장이 열려 있나. { open, reason, ny:{...} }
//   검사 창은 09:35~15:55 ET (조기폐장일은 09:35~12:55).
function nyseSession(date = new Date()) {
  const p = nyParts(date);
  const k = key(p.y, p.m, p.d);
  const cal = calendarFor(p.y);
  const mins = p.hh * 60 + p.mm;
  if (p.dow === 0 || p.dow === 6) return { open: false, reason: '주말', ny: p };
  if (cal.closed.has(k)) return { open: false, reason: '휴장일', ny: p };
  const closeMin = cal.early.has(k) ? 12 * 60 + 55 : 15 * 60 + 55;
  if (mins < 9 * 60 + 35) return { open: false, reason: '개장 전', ny: p };
  if (mins > closeMin) return { open: false, reason: cal.early.has(k) ? '조기폐장 후' : '폐장 후', ny: p };
  return { open: true, reason: cal.early.has(k) ? '장중(조기폐장일)' : '장중', ny: p };
}

module.exports = { nyseSession, yearCalendar, easter, nthWeekday };
