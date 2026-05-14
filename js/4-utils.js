// ============================================
// 4-utils.js: 순수 유틸리티 함수
// ============================================
// HTML/JS 이스케이프, 금액 포맷, 주차 키 계산
// 다른 모듈 의존성 없음 (가장 먼저 로드되는 함수 모듈)

// HTML 이스케이프 (XSS 방지)
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// JS 문자열 이스케이프 (onclick 속성 안에 문자열 넣을 때)
function escapeJs(str) {
  if (str == null) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

// 대기 주문 itemId → 총 주문 수량 맵 (요청/재고/입고 행에 🛒 주문중 N 배지 표시용)
// 2026-05-12 추가 — "재고 부족인데 이미 주문됨" vs "주문 안 됨" 한눈에 구분
function getPendingOrderMap() {
  const map = {};
  if (typeof orders === 'undefined' || !Array.isArray(orders)) return map;
  orders.forEach(o => {
    if ((o.status || 'pending') !== 'pending') return;
    (o.items || []).forEach(it => {
      if (!it.itemId) return;
      map[it.itemId] = (map[it.itemId] || 0) + (it.qty || 0);
    });
  });
  return map;
}

// 대기 요청에 들어 있는 itemId Set (📝 주문필요 배지 조건의 한 축)
// 누군가 요청한 itemId만 추적 — 무차별 표시 방지
function getPendingRequestItemIdSet() {
  const set = new Set();
  if (typeof requests === 'undefined' || !Array.isArray(requests)) return set;
  requests.forEach(r => {
    if ((r.status || 'completed') !== 'pending') return;
    if (r.itemId) set.add(r.itemId);
  });
  return set;
}

// 분류 뱃지 (재고/요청/입고/반출관리 모든 탭에서 공용)
// 치과재료(오렌지) / 구강위생용품(스카이) / 기타(회색). 빈 문자열이면 ''
function categoryBadgeHtml_(category) {
  if (!category) return '';
  let cls = 'bg-slate-100 text-slate-600';
  if (category === '치과재료') cls = 'bg-orange-100 text-orange-700';
  else if (category === '구강위생용품') cls = 'bg-sky-100 text-sky-700';
  return '<span class="inline-block px-1.5 py-0.5 ' + cls +
    ' rounded text-[10px] font-bold mr-1.5 align-middle">' + escapeHtml(category) + '</span>';
}

// 금액 표시: 1234567 → "1,234,567원"
function formatWon(n) {
  if (!n || n < 0) n = 0;
  return Math.round(n).toLocaleString('ko-KR') + '원';
}

// 짧은 금액 표시: 큰 금액은 "123만원", "1.5억" 형태
function formatWonShort(n) {
  if (!n || n < 0) return '0원';
  n = Math.round(n);
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '억';
  if (n >= 10000) return Math.round(n / 10000).toLocaleString('ko-KR') + '만원';
  return n.toLocaleString('ko-KR') + '원';
}

// 날짜 → 주차 키 (예: "2026-05-09" → "2026-05-W2")
// 주차 기준: 토요일~다음 금요일 (반출이 금요일이라 토요일에 새 주차 시작)
// 예: 2026-05-01(금) → 2026-04-W4 / 2026-05-02(토) → 2026-05-W1 /
//     2026-05-08(금) → 2026-05-W1 / 2026-05-09(토) → 2026-05-W2
function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  const dow = d.getDay();  // 0=Sun ... 6=Sat
  // 가장 최근 토요일까지 며칠 뒤로 가야 하나 (Sat→0, Sun→1, ..., Fri→6)
  const daysBack = (dow + 1) % 7;
  const sat = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysBack);
  const year = sat.getFullYear();
  const month = sat.getMonth() + 1;
  const day = sat.getDate();
  // 해당 달의 첫 토요일 날짜
  const firstOfMonth = new Date(year, month - 1, 1);
  const firstDow = firstOfMonth.getDay();
  const daysToFirstSat = (6 - firstDow + 7) % 7;
  const firstSatDate = 1 + daysToFirstSat;
  const weekNum = Math.floor((day - firstSatDate) / 7) + 1;
  return year + '-' + String(month).padStart(2, '0') + '-W' + weekNum;
}

// 주차 키 → 라벨 (예: "2025-11-W1" → "25년 11월 1주차")
function formatWeekLabel(weekKey) {
  if (weekKey.includes('주차')) return weekKey;
  const m = weekKey.match(/(\d{4})-(\d{2})-W(\d+)/);
  if (!m) return weekKey;
  const [, year, month, week] = m;
  const yy = year.slice(-2);
  return yy + '년 ' + parseInt(month) + '월 ' + week + '주차';
}

// 검색 매칭 헬퍼: 단순 substring 매치 (대소문자 무시)
// (초성 검색 기능은 IME 호환성 문제로 제거됨)
function matchesSearch(target, query) {
  if (!query) return true;
  const t = String(target || '').toLowerCase();
  const q = String(query).toLowerCase();
  return t.includes(q);
}
