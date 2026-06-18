// ===== 바카라 전략 앱 =====
// 모든 데이터는 브라우저 localStorage 에만 저장됩니다.

const STORAGE_KEY = "baccarat-strategy-app";

const state = {
  settings: {
    startBankroll: 1000000,
    baseBet: 10000,
    bettingSystem: "flat",
    predictStrategy: "banker",
  },
  // 각 항목: { result, betSide, betAmount, outcome('W'|'L'|'P'|null), bankrollAfter }
  history: [],
};

// ---------- 저장 / 로드 ----------
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    Object.assign(state.settings, parsed.settings || {});
    state.history = Array.isArray(parsed.history) ? parsed.history : [];
  } catch (e) {
    console.warn("저장된 데이터를 불러오지 못했습니다.", e);
  }
}

// ---------- 통화 포맷 ----------
const won = (n) => (Math.round(n)).toLocaleString("ko-KR") + "원";

// ---------- 베팅 금액 계산 (베팅 시스템) ----------
// 과거 베팅 결과(W/L, 무승부는 변화 없음) 시퀀스를 재생하여 다음 베팅액 산출
function outcomesSequence() {
  return state.history
    .map((h) => h.outcome)
    .filter((o) => o === "W" || o === "L"); // 무승부/노베팅 제외
}

function computeNextBet() {
  const base = state.settings.baseBet;
  const sys = state.settings.bettingSystem;
  const seq = outcomesSequence();

  if (sys === "flat") return base;

  if (sys === "martingale") {
    let bet = base;
    for (const o of seq) bet = o === "L" ? bet * 2 : base;
    return bet;
  }

  if (sys === "paroli") {
    // 역마틴게일: 승리 시 2배 증가, 3연승 또는 패배 시 초기화
    let mult = 1, wins = 0;
    for (const o of seq) {
      if (o === "W") {
        wins++;
        if (wins >= 3) { mult = 1; wins = 0; }
        else mult *= 2;
      } else { mult = 1; wins = 0; }
    }
    return base * mult;
  }

  if (sys === "1326") {
    const steps = [1, 3, 2, 6];
    let idx = 0;
    for (const o of seq) {
      if (o === "W") { idx++; if (idx > 3) idx = 0; }
      else idx = 0;
    }
    return base * steps[idx];
  }

  if (sys === "dalembert") {
    let units = 1;
    for (const o of seq) {
      if (o === "L") units++;
      else units = Math.max(1, units - 1);
    }
    return base * units;
  }

  return base;
}

// ---------- 다음 예측 (예측 전략) ----------
function lastNonTie() {
  for (let i = state.history.length - 1; i >= 0; i--) {
    if (state.history[i].result !== "T") return state.history[i].result;
  }
  return null;
}

function computeNextSide() {
  const strat = state.settings.predictStrategy;
  if (strat === "banker") return "B";

  const last = lastNonTie();
  if (strat === "follow") return last || "B";
  if (strat === "opposite") {
    if (!last) return "B";
    return last === "P" ? "B" : "P";
  }
  if (strat === "majority") {
    const p = state.history.filter((h) => h.result === "P").length;
    const b = state.history.filter((h) => h.result === "B").length;
    if (p === b) return "B";
    return p > b ? "P" : "B";
  }
  return "B";
}

// ---------- 결과 기록 ----------
function recordResult(result) {
  const betSide = computeNextSide();
  const betAmount = computeNextBet();
  const prevBankroll = state.history.length
    ? state.history[state.history.length - 1].bankrollAfter
    : state.settings.startBankroll;

  let outcome, delta;
  if (result === "T") {
    // 타이: P/B 베팅은 무승부 처리(반환)
    outcome = "P"; // push (변화 없음)
    delta = 0;
  } else if (result === betSide) {
    outcome = "W";
    // 뱅커 승리 5% 커미션, 플레이어 1:1
    delta = betSide === "B" ? betAmount * 0.95 : betAmount;
  } else {
    outcome = "L";
    delta = -betAmount;
  }

  state.history.push({
    result,
    betSide,
    betAmount,
    outcome,
    bankrollAfter: prevBankroll + delta,
  });
  save();
  render();
}

function undo() {
  state.history.pop();
  save();
  render();
}

function clearAll() {
  if (!confirm("모든 기록을 삭제할까요?")) return;
  state.history = [];
  save();
  render();
}

function applySettings() {
  state.settings.startBankroll = Number(document.getElementById("startBankroll").value) || 0;
  state.settings.baseBet = Number(document.getElementById("baseBet").value) || 0;
  state.settings.bettingSystem = document.getElementById("bettingSystem").value;
  state.settings.predictStrategy = document.getElementById("predictStrategy").value;
  state.history = []; // 자금/베팅 변경 시 시뮬레이션 초기화
  save();
  render();
}

// ---------- 렌더링 ----------
function currentBankroll() {
  return state.history.length
    ? state.history[state.history.length - 1].bankrollAfter
    : state.settings.startBankroll;
}

function renderBankroll() {
  const cur = currentBankroll();
  const pl = cur - state.settings.startBankroll;
  document.getElementById("currentBankroll").textContent = won(cur);

  const plEl = document.getElementById("profitLoss");
  plEl.textContent = (pl >= 0 ? "+" : "") + won(pl);
  plEl.className = "stat-value " + (pl >= 0 ? "profit-positive" : "profit-negative");

  document.getElementById("nextBetAmount").textContent = won(computeNextBet());
}

function renderRecommendation() {
  const side = computeNextSide();
  const amount = computeNextBet();
  const label = side === "P" ? "플레이어 (PLAYER)" : "뱅커 (BANKER)";
  const el = document.getElementById("recommendation");
  el.innerHTML =
    `다음 베팅 추천: <span class="rec-bet rec-${side}">${label}</span><br/>` +
    `추천 금액: <strong>${won(amount)}</strong>`;
}

function renderStats() {
  const h = state.history;
  const total = h.length;
  const p = h.filter((x) => x.result === "P").length;
  const b = h.filter((x) => x.result === "B").length;
  const t = h.filter((x) => x.result === "T").length;
  const pct = (n) => (total ? ((n / total) * 100).toFixed(1) + "%" : "-");

  // 현재 연속(타이 무시)
  let streakSide = null, streakLen = 0;
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i].result === "T") continue;
    if (streakSide === null) { streakSide = h[i].result; streakLen = 1; }
    else if (h[i].result === streakSide) streakLen++;
    else break;
  }
  const streakText = streakSide
    ? `${streakSide === "P" ? "P" : "B"} ${streakLen}연속`
    : "-";

  const wins = h.filter((x) => x.outcome === "W").length;
  const losses = h.filter((x) => x.outcome === "L").length;
  const betCount = wins + losses;
  const hitRate = betCount ? ((wins / betCount) * 100).toFixed(1) + "%" : "-";

  const cells = [
    ["총 게임", total],
    ["플레이어", `${p} (${pct(p)})`],
    ["뱅커", `${b} (${pct(b)})`],
    ["타이", `${t} (${pct(t)})`],
    ["현재 연속", streakText],
    ["추천 적중", `${wins}/${betCount} (${hitRate})`],
  ];

  document.getElementById("statsGrid").innerHTML = cells
    .map(
      ([label, val]) =>
        `<div class="stat-box"><span class="stat-label">${label}</span>` +
        `<span class="stat-value">${val}</span></div>`
    )
    .join("");
}

// 비드 플레이트: 입력 순서대로 6행 세로 채움
function renderBeadPlate() {
  const el = document.getElementById("beadPlate");
  el.innerHTML = "";
  state.history.forEach((h, i) => {
    const row = (i % 6) + 1;
    const col = Math.floor(i / 6) + 1;
    const cell = document.createElement("div");
    cell.className = `cell ${h.result}`;
    cell.style.gridRow = row;
    cell.style.gridColumn = col;
    cell.textContent = h.result;
    el.appendChild(cell);
  });
  // 컬럼 폭 확보
  const cols = Math.max(1, Math.ceil(state.history.length / 6));
  el.style.gridTemplateColumns = `repeat(${cols}, 34px)`;
}

// 빅 로드: P/B 만 사용, 같은 결과는 아래로, 다르면 새 열, 6행 초과 시 우측 꼬리(dragon tail)
function renderBigRoad() {
  const el = document.getElementById("bigRoad");
  el.innerHTML = "";

  // 타이는 직전 P/B 셀에 카운트로 부착
  const marks = [];
  for (const h of state.history) {
    if (h.result === "T") {
      if (marks.length) marks[marks.length - 1].ties++;
    } else {
      marks.push({ side: h.result, ties: 0 });
    }
  }

  // 연속(streak)별 논리 열 구성
  const columns = [];
  for (const m of marks) {
    const lastCol = columns[columns.length - 1];
    if (lastCol && lastCol[0].side === m.side) lastCol.push(m);
    else columns.push([m]);
  }

  // 그리드 좌표 배치 (dragon tail 처리)
  let drawCol = 1;
  let maxCol = 1;
  for (const col of columns) {
    let usedMax = drawCol;
    col.forEach((m, j) => {
      let row, c;
      if (j < 6) { row = j + 1; c = drawCol; }
      else { row = 6; c = drawCol + (j - 5); }
      usedMax = Math.max(usedMax, c);

      const cell = document.createElement("div");
      cell.className = `cell ${m.side}`;
      cell.style.gridRow = row;
      cell.style.gridColumn = c;
      if (m.ties > 0) {
        const tm = document.createElement("span");
        tm.className = "tie-mark";
        tm.textContent = "／" + (m.ties > 1 ? m.ties : "");
        cell.appendChild(tm);
      }
      el.appendChild(cell);
    });
    drawCol = usedMax + 1;
    maxCol = Math.max(maxCol, usedMax);
  }
  el.style.gridTemplateColumns = `repeat(${Math.max(1, maxCol)}, 34px)`;
}

function syncSettingsInputs() {
  document.getElementById("startBankroll").value = state.settings.startBankroll;
  document.getElementById("baseBet").value = state.settings.baseBet;
  document.getElementById("bettingSystem").value = state.settings.bettingSystem;
  document.getElementById("predictStrategy").value = state.settings.predictStrategy;
}

function render() {
  renderBankroll();
  renderRecommendation();
  renderStats();
  renderBeadPlate();
  renderBigRoad();
}

// ---------- 이벤트 바인딩 ----------
function init() {
  load();
  syncSettingsInputs();

  document.querySelectorAll(".result-btn[data-result]").forEach((btn) => {
    btn.addEventListener("click", () => recordResult(btn.dataset.result));
  });
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("clearBtn").addEventListener("click", clearAll);
  document.getElementById("applySettings").addEventListener("click", applySettings);
  document.getElementById("predictStrategy").addEventListener("change", () => {
    state.settings.predictStrategy = document.getElementById("predictStrategy").value;
    save();
    render();
  });

  render();
}

document.addEventListener("DOMContentLoaded", init);
