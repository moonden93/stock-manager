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

// 날짜 → 주차 키 (예: "2025-11-07" → "2025-11-W1")
function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const week = Math.ceil(day / 7);
  return year + '-' + String(month).padStart(2, '0') + '-W' + week;
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
