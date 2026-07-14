# BetBoard — 스포츠 베팅 대시보드 프로토타입

로빈후드 레전드(Robinhood Legend) 스타일의 위젯 기반 스포츠 베팅 대시보드입니다.
Next.js(App Router) + Tailwind CSS v4 + react-grid-layout v2로 만들어졌습니다.

## 실행

```bash
npm install
npm run dev
```

http://localhost:3000 에서 확인할 수 있습니다.

## 기능

- **24x24 그리드 시스템** — 가로 24컬럼 × 세로 24행이 뷰포트를 가득 채우며,
  행 높이는 화면 높이에 맞춰 자동 계산됩니다 (`components/Dashboard.tsx`).
- **드래그 & 리사이즈** — 위젯 헤더를 잡아 끌면 이동, 우하단 모서리를 끌면
  크기 조절. 변경된 레이아웃은 `localStorage`에 저장되고 "레이아웃 초기화"
  버튼으로 되돌릴 수 있습니다.
- **4개 위젯**
  | 위젯 | 파일 | 설명 |
  |---|---|---|
  | 배당률 추이 | `components/widgets/OddsTrendChart.tsx` | 홈/원정 승 배당 24시간 라인 차트 (SVG, 크로스헤어 + 툴팁) |
  | 실시간 배당판 | `components/widgets/LiveOddsBoard.tsx` | 경기별 승/무/패 배당 버튼, 클릭 시 슬립에 담김 |
  | 베팅 슬립 | `components/widgets/BetSlip.tsx` | 조합(파라레이) 배당·예상 적중액 계산 |
  | 경기 일정 · 스코어 | `components/widgets/GameSchedule.tsx` | LIVE 스코어와 예정 경기 |

## 참고

- 모든 데이터는 `lib/data.ts`의 목업이며, 시드 기반으로 결정적으로 생성되어
  서버/클라이언트 하이드레이션이 일치합니다.
- 다크 전용 테마이며 디자인 토큰은 `app/globals.css`의 `@theme` 블록에
  정의되어 있습니다.
