// ============================================
// 11-stats.js: 통계 화면
// ============================================
// 의존: 4-utils.js (getWeekKey, formatWeekLabel, formatWon, formatWonShort)
//       14-export.js (exportStatsToExcel)
//       모든 이전 모듈
// 호출자: 99-main.js의 switchTab('stats')

// ============================================================
let statsTab = 'team'; // team / vendor / weekly / anomaly
let statsPeriod = 'all'; // all / month / week / custom
let statsCustomStart = ''; // YYYY-MM-DD
let statsCustomEnd = '';   // YYYY-MM-DD
// 이상치 탭 비교 기준 월 (YYYY-MM 형식). 빈 문자열이면 "현재 달" 의미.
let anomalyMonth = '';

function renderStats() {
  // 기간 필터링
  let baseHistory = history.filter(h => h.type === 'out');
  
  if (statsPeriod === 'month') {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    baseHistory = baseHistory.filter(h => new Date(h.date) >= monthStart);
  } else if (statsPeriod === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    baseHistory = baseHistory.filter(h => new Date(h.date) >= weekAgo);
  } else if (statsPeriod === 'custom' && statsCustomStart && statsCustomEnd) {
    const start = new Date(statsCustomStart + 'T00:00:00');
    const end = new Date(statsCustomEnd + 'T23:59:59');
    baseHistory = baseHistory.filter(h => {
      const d = new Date(h.date);
      return d >= start && d <= end;
    });
  }
  
  const totalQty = baseHistory.reduce((s, h) => s + h.qty, 0);
  const totalCost = baseHistory.reduce((s, h) => s + h.qty * (h.price || 0), 0);
  
  // 기간 라벨
  let periodLabel = '전체 기간';
  if (statsPeriod === 'month') {
    const m = new Date();
    periodLabel = m.getFullYear() + '년 ' + (m.getMonth() + 1) + '월';
  } else if (statsPeriod === 'week') {
    periodLabel = '최근 7일';
  } else if (statsPeriod === 'custom' && statsCustomStart && statsCustomEnd) {
    periodLabel = statsCustomStart + ' ~ ' + statsCustomEnd;
  }
  
  // 오늘 날짜 (date input의 max 값으로 사용)
  const today = new Date().toISOString().slice(0, 10);
  
  let html = '<div class="space-y-4">' +
    '<div class="bg-purple-50 border border-purple-200 rounded-2xl p-4">' +
    '<div class="flex items-start justify-between gap-2 mb-1">' +
    '<h2 class="text-lg font-bold text-slate-900">📊 사용량 통계</h2>' +
    '<button onclick="exportStatsToExcel()" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg whitespace-nowrap shrink-0">📥 Excel 다운로드</button>' +
    '</div>' +
    '<p class="text-sm text-slate-600">' + periodLabel + ' · 총 <strong>' + totalQty + '</strong>개 출고 (' + baseHistory.length + '건)</p>' +
    '<p class="text-base font-bold text-purple-700 mt-1">💰 총 ' + formatWon(totalCost) + '</p></div>' +
    
    // 기간 선택 (프리셋)
    '<div class="bg-white rounded-2xl border-2 border-slate-200 p-3">' +
    '<p class="text-xs text-slate-500 mb-2">기간:</p>' +
    '<div class="flex gap-1 mb-3">' +
    '<button onclick="setStatsPeriod(\'all\')" class="flex-1 py-2 text-xs font-bold rounded-lg transition ' +
    (statsPeriod === 'all' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-700') + '">전체</button>' +
    '<button onclick="setStatsPeriod(\'month\')" class="flex-1 py-2 text-xs font-bold rounded-lg transition ' +
    (statsPeriod === 'month' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-700') + '">이번 달</button>' +
    '<button onclick="setStatsPeriod(\'week\')" class="flex-1 py-2 text-xs font-bold rounded-lg transition ' +
    (statsPeriod === 'week' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-700') + '">최근 7일</button>' +
    '</div>' +
    
    // 직접 날짜 선택
    '<div class="border-t border-slate-100 pt-3">' +
    '<p class="text-xs text-slate-500 mb-2">📅 기간 직접 선택:</p>' +
    '<div class="flex flex-wrap items-center gap-2">' +
    '<input type="date" id="stats-date-start" value="' + escapeHtml(statsCustomStart) + '" max="' + today + '" ' +
    'class="flex-1 min-w-[130px] px-3 py-2 text-sm bg-slate-50 border-2 ' +
    (statsPeriod === 'custom' ? 'border-purple-400' : 'border-slate-200') + ' rounded-lg focus:outline-none focus:border-purple-500" />' +
    '<span class="text-slate-400 text-sm">~</span>' +
    '<input type="date" id="stats-date-end" value="' + escapeHtml(statsCustomEnd) + '" max="' + today + '" ' +
    'class="flex-1 min-w-[130px] px-3 py-2 text-sm bg-slate-50 border-2 ' +
    (statsPeriod === 'custom' ? 'border-purple-400' : 'border-slate-200') + ' rounded-lg focus:outline-none focus:border-purple-500" />' +
    '<button onclick="applyCustomDateRange()" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg whitespace-nowrap">조회</button>' +
    '</div>' +
    (statsPeriod === 'custom' ? '<p class="text-[11px] text-purple-600 font-medium mt-2">✓ 사용자 지정 기간 적용 중</p>' : '') +
    '</div></div>' +
    
    // 보기 모드
    '<div class="flex bg-slate-100 rounded-xl p-1 gap-0.5">' +
    '<button onclick="statsTab = \'team\'; renderStats();" class="flex-1 py-2 rounded-lg font-bold text-xs sm:text-sm transition ' +
    (statsTab === 'team' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600') + '">👥 팀별</button>' +
    '<button onclick="statsTab = \'vendor\'; renderStats();" class="flex-1 py-2 rounded-lg font-bold text-xs sm:text-sm transition ' +
    (statsTab === 'vendor' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600') + '">🏢 업체별</button>' +
    '<button onclick="statsTab = \'weekly\'; renderStats();" class="flex-1 py-2 rounded-lg font-bold text-xs sm:text-sm transition ' +
    (statsTab === 'weekly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600') + '">📅 주차별</button>' +
    '<button onclick="statsTab = \'anomaly\'; renderStats();" class="flex-1 py-2 rounded-lg font-bold text-xs sm:text-sm transition ' +
    (statsTab === 'anomaly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600') + '">📈 이상치</button>' +
    '</div>';

  if (statsTab === 'anomaly') {
    // 이상치는 자체 기간 기준(이번 달 vs 지난 3개월) 사용 — statsPeriod 필터 무시
    html += renderStatsByAnomaly();
  } else if (totalQty === 0) {
    html += '<div class="bg-white rounded-2xl border-2 border-slate-200 py-12 text-center">' +
      '<p class="text-4xl mb-2">📭</p>' +
      '<p class="text-sm text-slate-400">출고 내역이 없습니다</p></div>';
  } else if (statsTab === 'team') {
    html += renderStatsByTeam(baseHistory);
  } else if (statsTab === 'vendor') {
    html += renderStatsByVendor(baseHistory);
  } else if (statsTab === 'weekly') {
    html += renderStatsByWeekly(baseHistory);
  }
  
  html += '</div>';
  document.getElementById('page-content').innerHTML = html;
}

// 프리셋 버튼 클릭 시 (사용자 지정 날짜는 초기화)
function setStatsPeriod(period) {
  statsPeriod = period;
  if (period !== 'custom') {
    statsCustomStart = '';
    statsCustomEnd = '';
  }
  renderStats();
}

// 사용자 지정 날짜 적용
function applyCustomDateRange() {
  const startEl = document.getElementById('stats-date-start');
  const endEl = document.getElementById('stats-date-end');
  if (!startEl || !endEl) return;
  
  const start = startEl.value;
  const end = endEl.value;
  
  if (!start || !end) {
    showAlert('날짜를 선택해주세요', '시작일과 종료일을 모두 입력해야\n기간 조회가 가능합니다.\n\n비어 있는 날짜 칸을 눌러\n달력에서 골라주세요.');
    return;
  }
  if (start > end) {
    showAlert('날짜 범위가 잘못되었습니다', '시작일은 종료일보다\n빠르거나 같아야 합니다.\n\n두 날짜의 순서를 확인해주세요.');
    return;
  }
  
  statsCustomStart = start;
  statsCustomEnd = end;
  statsPeriod = 'custom';
  renderStats();
  showToast(start + ' ~ ' + end + ' 기간 조회', 'success');
}

function renderStatsByTeam(baseHistory) {
  const teamStats = {};
  teams.forEach(t => { teamStats[t] = { count: 0, qty: 0, cost: 0, items: {} }; });
  baseHistory.forEach(h => {
    if (!teamStats[h.team]) teamStats[h.team] = { count: 0, qty: 0, cost: 0, items: {} };
    teamStats[h.team].count++;
    teamStats[h.team].qty += h.qty;
    teamStats[h.team].cost += h.qty * (h.price || 0);
    const k = h.vendor + '::' + h.name;
    if (!teamStats[h.team].items[k]) teamStats[h.team].items[k] = { vendor: h.vendor, name: h.name, unit: h.unit, qty: 0, cost: 0 };
    teamStats[h.team].items[k].qty += h.qty;
    teamStats[h.team].items[k].cost += h.qty * (h.price || 0);
  });
  // 정렬: 설정 팀 관리 순서(teams 배열) 기준. 그 외 옛 팀명은 뒤에.
  const teamList = Object.entries(teamStats)
    .map(([t, v]) => ({ team: t, ...v }))
    .filter(t => t.qty > 0)
    .sort((a, b) => {
      const ai = teams.indexOf(a.team);
      const bi = teams.indexOf(b.team);
      if (ai === -1 && bi === -1) return a.team.localeCompare(b.team);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  const maxCost = Math.max(1, ...teamList.map(t => t.cost));
  
  let html = '<div class="space-y-2">';
  teamList.forEach(t => {
    const pct = (t.cost / maxCost) * 100;
    const itemList = Object.values(t.items).sort((a, b) => b.cost - a.cost).slice(0, 5);
    
    html += '<div class="bg-white rounded-2xl border-2 border-slate-200 p-4">' +
      '<div class="flex items-start justify-between mb-2 gap-2">' +
      '<div class="flex items-center gap-2 flex-wrap">' +
      '<h3 class="text-sm font-bold text-slate-900">' + escapeHtml(t.team) + '</h3>' +
      '<button onclick="openTeamStatsDetail(\'' + escapeJs(t.team) + '\')" class="text-[11px] px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full font-bold">📋 상세</button>' +
      '</div>' +
      '<div class="text-right">' +
      '<div class="text-base font-bold text-blue-700">' + formatWon(t.cost) + '</div>' +
      '<div class="text-xs text-slate-500">' + t.count + '건 · ' + t.qty + '개</div>' +
      '</div></div>' +
      '<div class="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">' +
      '<div class="h-full ' + (t.team.includes('층') ? 'bg-cyan-500' : 'bg-blue-500') + ' transition-all" style="width:' + pct + '%"></div>' +
      '</div>';

    if (itemList.length > 0) {
      html += '<div class="space-y-1 pt-2 border-t border-slate-100">';
      itemList.forEach(it => {
        html += '<div class="flex items-center text-xs py-0.5 gap-2">' +
          '<span class="text-slate-500 shrink-0">' + escapeHtml(it.vendor) + '</span>' +
          '<span class="flex-1 text-slate-700 truncate">' + escapeHtml(it.name) + '</span>' +
          '<span class="text-slate-600 shrink-0">' + it.qty + '</span>' +
          '<span class="font-bold text-slate-900 shrink-0 w-20 text-right">' + formatWon(it.cost) + '</span></div>';
      });
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function renderStatsByVendor(baseHistory) {
  const vendorStats = {};
  baseHistory.forEach(h => {
    if (!vendorStats[h.vendor]) vendorStats[h.vendor] = { count: 0, qty: 0, cost: 0, items: {} };
    vendorStats[h.vendor].count++;
    vendorStats[h.vendor].qty += h.qty;
    vendorStats[h.vendor].cost += h.qty * (h.price || 0);
    const k = h.name;
    if (!vendorStats[h.vendor].items[k]) vendorStats[h.vendor].items[k] = { name: h.name, unit: h.unit, qty: 0, cost: 0 };
    vendorStats[h.vendor].items[k].qty += h.qty;
    vendorStats[h.vendor].items[k].cost += h.qty * (h.price || 0);
  });
  const vendorList = Object.entries(vendorStats).map(([v, d]) => ({ vendor: v, ...d })).sort((a, b) => b.cost - a.cost);
  const maxCost = Math.max(1, ...vendorList.map(v => v.cost));
  
  let html = '<div class="space-y-2">';
  vendorList.forEach(v => {
    const pct = (v.cost / maxCost) * 100;
    const itemList = Object.values(v.items).sort((a, b) => b.cost - a.cost).slice(0, 5);
    
    html += '<div class="bg-white rounded-2xl border-2 border-slate-200 p-4">' +
      '<div class="flex items-start justify-between mb-2 gap-2">' +
      '<h3 class="text-sm font-bold text-slate-900">🏢 ' + escapeHtml(v.vendor) + '</h3>' +
      '<div class="text-right">' +
      '<div class="text-base font-bold text-emerald-700">' + formatWon(v.cost) + '</div>' +
      '<div class="text-xs text-slate-500">' + v.count + '건 · ' + v.qty + '개</div>' +
      '</div></div>' +
      '<div class="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">' +
      '<div class="h-full bg-emerald-500 transition-all" style="width:' + pct + '%"></div>' +
      '</div>';
    if (itemList.length > 0) {
      html += '<div class="space-y-1 pt-2 border-t border-slate-100">';
      itemList.forEach(it => {
        html += '<div class="flex items-center text-xs py-0.5 gap-2">' +
          '<span class="flex-1 text-slate-700 truncate">' + escapeHtml(it.name) + '</span>' +
          '<span class="text-slate-600 shrink-0">' + it.qty + '</span>' +
          '<span class="font-bold text-slate-900 shrink-0 w-20 text-right">' + formatWon(it.cost) + '</span></div>';
      });
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}

// 주차별 통계 - 각 주차별로 팀별 사용량
function renderStatsByWeekly(baseHistory) {
  // 주차별 그룹핑
  const weekStats = {};
  baseHistory.forEach(h => {
    const weekKey = h.weekKey || getWeekKey(h.date);
    const lineCost = h.qty * (h.price || 0);
    if (!weekStats[weekKey]) weekStats[weekKey] = { weekKey, total: 0, totalCost: 0, teams: {}, items: {} };
    weekStats[weekKey].total += h.qty;
    weekStats[weekKey].totalCost += lineCost;
    if (!weekStats[weekKey].teams[h.team]) weekStats[weekKey].teams[h.team] = { qty: 0, cost: 0 };
    weekStats[weekKey].teams[h.team].qty += h.qty;
    weekStats[weekKey].teams[h.team].cost += lineCost;
    const ik = h.vendor + '::' + h.name;
    if (!weekStats[weekKey].items[ik]) weekStats[weekKey].items[ik] = { vendor: h.vendor, name: h.name, unit: h.unit, qty: 0, cost: 0 };
    weekStats[weekKey].items[ik].qty += h.qty;
    weekStats[weekKey].items[ik].cost += lineCost;
  });
  
  // 주차별 정렬 (최신순)
  const weekList = Object.values(weekStats).sort((a, b) => b.weekKey.localeCompare(a.weekKey));
  const maxWeekCost = Math.max(1, ...weekList.map(w => w.totalCost));
  
  let html = '<div class="space-y-2">';
  
  if (weekList.length === 0) {
    html += '<div class="bg-white rounded-2xl border-2 border-slate-200 py-12 text-center">' +
      '<p class="text-4xl mb-2">📅</p>' +
      '<p class="text-sm text-slate-400">주차별 데이터가 없습니다</p></div>';
  } else {
    weekList.forEach(w => {
      const pct = (w.totalCost / maxWeekCost) * 100;
      const teamList = Object.entries(w.teams).map(([t, d]) => ({ team: t, qty: d.qty, cost: d.cost })).sort((a, b) => b.cost - a.cost);
      const topItems = Object.values(w.items).sort((a, b) => b.cost - a.cost).slice(0, 3);
      
      html += '<div class="bg-white rounded-2xl border-2 border-slate-200 p-4">' +
        '<div class="flex items-start justify-between mb-2 gap-2">' +
        '<h3 class="text-sm font-bold text-slate-900">📅 ' + escapeHtml(formatWeekLabel(w.weekKey)) + '</h3>' +
        '<div class="text-right">' +
        '<div class="text-base font-bold text-purple-700">' + formatWon(w.totalCost) + '</div>' +
        '<div class="text-xs text-slate-500">' + w.total + '개</div>' +
        '</div></div>' +
        '<div class="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">' +
        '<div class="h-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all" style="width:' + pct + '%"></div>' +
        '</div>';
      
      // 팀별 막대 - 금액 기준
      html += '<div class="space-y-1 pt-2 border-t border-slate-100 mb-2">' +
        '<p class="text-[10px] text-slate-500 mb-1">팀별 사용액:</p>';
      teamList.forEach(t => {
        const teamPct = w.totalCost > 0 ? (t.cost / w.totalCost) * 100 : 0;
        html += '<div class="flex items-center text-xs gap-2">' +
          '<span class="text-slate-700 w-24 truncate shrink-0">' + escapeHtml(t.team) + '</span>' +
          '<div class="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">' +
          '<div class="h-full ' + (t.team.includes('층') ? 'bg-cyan-500' : 'bg-blue-500') + '" style="width:' + teamPct + '%"></div>' +
          '</div>' +
          '<span class="font-bold text-slate-900 shrink-0 w-20 text-right">' + formatWon(t.cost) + '</span></div>';
      });
      html += '</div>';
      
      // 상위 품목 - 금액 기준
      if (topItems.length > 0) {
        html += '<div class="space-y-1 pt-2 border-t border-slate-100">' +
          '<p class="text-[10px] text-slate-500 mb-1">금액 큰 품목 TOP 3:</p>';
        topItems.forEach(it => {
          html += '<div class="flex items-center text-xs py-0.5 gap-2">' +
            '<span class="text-slate-500 text-[10px] shrink-0">' + escapeHtml(it.vendor) + '</span>' +
            '<span class="flex-1 text-slate-700 truncate">' + escapeHtml(it.name) + '</span>' +
            '<span class="text-slate-600 shrink-0">' + it.qty + '</span>' +
            '<span class="font-bold text-slate-900 shrink-0 w-20 text-right">' + formatWon(it.cost) + '</span></div>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
  }

  html += '</div>';
  return html;
}

// ============================================
// 팀별 상세 모달 (전체 품목 + 시간순 반출 이력)
// ============================================
// renderStats가 사용 중인 statsPeriod / statsCustomStart / statsCustomEnd 필터를 그대로 재사용해
// "지금 보이는 기간"의 해당 팀 이력만 보여준다.
function openTeamStatsDetail(teamName) {
  let baseHistory = history.filter(h => h.type === 'out' && h.team === teamName);

  if (statsPeriod === 'month') {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    baseHistory = baseHistory.filter(h => new Date(h.date) >= monthStart);
  } else if (statsPeriod === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    baseHistory = baseHistory.filter(h => new Date(h.date) >= weekAgo);
  } else if (statsPeriod === 'custom' && statsCustomStart && statsCustomEnd) {
    const start = new Date(statsCustomStart + 'T00:00:00');
    const end = new Date(statsCustomEnd + 'T23:59:59');
    baseHistory = baseHistory.filter(h => {
      const d = new Date(h.date);
      return d >= start && d <= end;
    });
  }

  let periodLabel = '전체 기간';
  if (statsPeriod === 'month') {
    const m = new Date();
    periodLabel = m.getFullYear() + '년 ' + (m.getMonth() + 1) + '월';
  } else if (statsPeriod === 'week') {
    periodLabel = '최근 7일';
  } else if (statsPeriod === 'custom' && statsCustomStart && statsCustomEnd) {
    periodLabel = statsCustomStart + ' ~ ' + statsCustomEnd;
  }

  const totalQty = baseHistory.reduce((s, h) => s + h.qty, 0);
  const totalCost = baseHistory.reduce((s, h) => s + h.qty * (h.price || 0), 0);

  // 품목별 합계
  const itemMap = {};
  baseHistory.forEach(h => {
    const k = h.vendor + '::' + h.name;
    if (!itemMap[k]) itemMap[k] = { vendor: h.vendor, name: h.name, qty: 0, cost: 0, count: 0 };
    itemMap[k].qty += h.qty;
    itemMap[k].cost += h.qty * (h.price || 0);
    itemMap[k].count++;
  });
  const itemList = Object.values(itemMap).sort((a, b) => b.cost - a.cost);

  // 시간순 이력 (최근 위)
  const timeline = baseHistory.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  // 품목별 합계 섹션
  let itemsHtml = '';
  if (itemList.length === 0) {
    itemsHtml = '<p class="text-sm text-slate-400 text-center py-4">출고 내역 없음</p>';
  } else {
    itemList.forEach(it => {
      itemsHtml += '<div class="flex items-center text-xs py-1.5 gap-2 border-b border-slate-100 last:border-b-0">' +
        '<span class="text-slate-500 shrink-0 w-20 truncate">' + escapeHtml(it.vendor) + '</span>' +
        '<span class="flex-1 text-slate-700 truncate">' + escapeHtml(it.name) + '</span>' +
        '<span class="text-slate-600 shrink-0 w-12 text-right">' + it.qty + '개</span>' +
        '<span class="font-bold text-slate-900 shrink-0 w-24 text-right">' + formatWon(it.cost) + '</span>' +
        '</div>';
    });
  }

  // 시간순 반출 이력 섹션
  let timelineHtml = '';
  if (timeline.length === 0) {
    timelineHtml = '<p class="text-sm text-slate-400 text-center py-4">반출 이력 없음</p>';
  } else {
    timeline.forEach(h => {
      const dt = new Date(h.releasedDate || h.date);
      const dateStr = (dt.getMonth() + 1) + '/' + dt.getDate();
      const cost = h.qty * (h.price || 0);
      const releasedByHtml = h.releasedBy
        ? '<span>· 📦 <strong>' + escapeHtml(h.releasedBy) + '</strong>님 반출</span>'
        : '<span class="italic text-slate-400">· 반출 담당자 미기록</span>';
      timelineHtml += '<div class="text-xs py-2 px-2 border-b border-slate-100 last:border-b-0 hover:bg-white">' +
        '<div class="flex items-center gap-2 mb-0.5">' +
        '<span class="text-slate-500 shrink-0 w-10">' + dateStr + '</span>' +
        '<span class="flex-1 text-slate-800 truncate font-medium">' + escapeHtml(h.name) + '</span>' +
        '<span class="font-bold text-blue-700 shrink-0 w-12 text-right">' + h.qty + '개</span>' +
        '<span class="font-bold text-slate-900 shrink-0 w-20 text-right">' + formatWon(cost) + '</span>' +
        '</div>' +
        '<div class="flex items-center gap-2 text-[11px] text-slate-500 ml-12 flex-wrap">' +
        '<span>' + escapeHtml(h.vendor || '') + '</span>' +
        (h.requester ? '<span>· ' + escapeHtml(h.requester) + '님 요청</span>' : '') +
        releasedByHtml +
        '</div>' +
        '</div>';
    });
  }

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-blue-50 border-b border-blue-200">' +
    '<div class="flex items-center justify-between gap-2">' +
    '<div>' +
    '<h3 class="text-base font-bold text-slate-900">📋 ' + escapeHtml(teamName) + ' 상세</h3>' +
    '<p class="text-xs text-slate-500 mt-0.5">' + escapeHtml(periodLabel) + '</p>' +
    '</div>' +
    '<div class="text-right">' +
    '<div class="text-base font-bold text-blue-700">' + formatWon(totalCost) + '</div>' +
    '<div class="text-[11px] text-slate-500">' + timeline.length + '건 · ' + totalQty + '개</div>' +
    '</div>' +
    '</div></div>' +
    '<div class="overflow-y-auto flex-1 px-5 py-4 space-y-5">' +
    '<section>' +
    '<h4 class="text-sm font-bold text-slate-900 mb-2">📦 품목별 합계 <span class="text-xs text-slate-400 font-normal">(' + itemList.length + '종)</span></h4>' +
    '<div class="bg-slate-50 rounded-xl p-3">' + itemsHtml + '</div>' +
    '</section>' +
    '<section>' +
    '<h4 class="text-sm font-bold text-slate-900 mb-2">📅 반출 이력 <span class="text-xs text-slate-400 font-normal">(' + timeline.length + '건, 최근순)</span></h4>' +
    '<div class="bg-slate-50 rounded-xl p-3">' + timelineHtml + '</div>' +
    '</section>' +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t">' +
    '<button onclick="closeModal()" class="w-full py-3 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-bold">닫기</button>' +
    '</div></div></div>';

  document.getElementById('modal-container').innerHTML = html;
}

// ============================================
// 이상치 탭 - 월 선택 드롭다운 헬퍼
// ============================================
// history에서 가장 옛 출고 월 ~ 현재 월까지 옵션 생성 (최신 월이 위)
function buildAnomalyMonthOptions(selectedDate) {
  const now = new Date();
  let oldest = now;
  history.forEach(h => {
    if (h.type !== 'out') return;
    const d = new Date(h.date);
    if (d < oldest) oldest = d;
  });

  // history 비어있어도 최소 12개월 옵션 생성
  const minStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  if (oldest > minStart) oldest = minStart;

  const opts = [];
  // 최신 → 옛날 순
  let cur = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(oldest.getFullYear(), oldest.getMonth(), 1);
  while (cur >= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth() + 1;
    const value = y + '-' + String(m).padStart(2, '0');
    const isCur = (y === now.getFullYear() && m === now.getMonth() + 1);
    const isSel = (selectedDate.getFullYear() === y && selectedDate.getMonth() + 1 === m);
    const label = y + '년 ' + m + '월' + (isCur ? ' (이번 달)' : '');
    opts.push('<option value="' + value + '"' + (isSel ? ' selected' : '') + '>' + label + '</option>');
    cur.setMonth(cur.getMonth() - 1);
  }
  return opts.join('');
}

function changeAnomalyMonth(value) {
  anomalyMonth = value || '';  // 빈 문자열 = 현재 달
  renderStats();
}

// ============================================
// 사용량 이상치 (이번 달 vs 지난 3개월 평균)
// ============================================
// 평소보다 +30%↑/-30%↓ 변동된 품목 + 신규 사용 + 사용 중단을 모두 보여줌.
// 운영자가 "이번 달 갑자기 많이 쓰는 품목" 또는 "갑자기 안 쓰는 품목"을 빠르게 파악.
function renderStatsByAnomaly() {
  // 비교 기준 월 결정: anomalyMonth가 비어있으면 현재 달 사용
  const targetYear = anomalyMonth ? parseInt(anomalyMonth.slice(0, 4), 10) : new Date().getFullYear();
  const targetMonth = anomalyMonth ? parseInt(anomalyMonth.slice(5, 7), 10) - 1 : new Date().getMonth();
  // 0-based month (Date 생성자 기준)
  const thisMonthStart = new Date(targetYear, targetMonth, 1);
  const thisMonthEnd = new Date(targetYear, targetMonth + 1, 1);  // 다음 달 1일 (exclusive)
  const threeMonthsAgoStart = new Date(targetYear, targetMonth - 3, 1);

  const outHistory = history.filter(h => h.type === 'out');
  const thisMonth = outHistory.filter(h => {
    const d = new Date(h.date);
    return d >= thisMonthStart && d < thisMonthEnd;
  });
  const past3 = outHistory.filter(h => {
    const d = new Date(h.date);
    return d >= threeMonthsAgoStart && d < thisMonthStart;
  });

  // ─── 주차 단위 정규화 ───
  // 핵심 아이디어: 월별 "총량" 비교는 진행 중인 달엔 불공평 (5월 1주차에 5월 총량 vs 4월 총량은 4배 차이).
  // 대신 양쪽 모두 "주평균"으로 환산해서 비교하면 진행 중이든 완료든 공평하게 보임.
  // 주 수: history에 실제 데이터가 있는 unique weekKey 개수로 셈.
  const thisWeekSet = new Set();
  const past3WeekSet = new Set();
  thisMonth.forEach(h => { if (h.weekKey) thisWeekSet.add(h.weekKey); });
  past3.forEach(h => { if (h.weekKey) past3WeekSet.add(h.weekKey); });
  const thisWeeks = Math.max(thisWeekSet.size, 1);
  const past3Weeks = Math.max(past3WeekSet.size, 1);
  // 진행 중인 달 여부 (오늘이 선택월의 마지막 날 이전이면 incomplete)
  const isIncomplete = thisMonthEnd > new Date();

  // 팀별 + 품목별로 합산 (총량). 비교 시점에 주평균으로 변환.
  function aggregateByTeamItem(arr) {
    const map = {};
    arr.forEach(h => {
      const team = h.team || '(팀 미지정)';
      if (!map[team]) map[team] = {};
      const k = h.vendor + '::' + h.name;
      if (!map[team][k]) map[team][k] = { vendor: h.vendor, name: h.name, qty: 0, cost: 0 };
      map[team][k].qty += h.qty;
      map[team][k].cost += h.qty * (h.price || 0);
    });
    return map;
  }

  const thisByTeam = aggregateByTeamItem(thisMonth);
  const past3ByTeam = aggregateByTeamItem(past3);
  const allTeams = new Set([...Object.keys(thisByTeam), ...Object.keys(past3ByTeam)]);

  // 가격 조회 (inventory 우선, 없으면 history에서 마지막 본 단가)
  function priceOfItem(vendor, name) {
    const inv = inventory.find(i => i.vendor === vendor && i.name === name);
    if (inv && inv.price) return inv.price;
    // fallback: history에서 마지막 단가
    for (let i = outHistory.length - 1; i >= 0; i--) {
      const h = outHistory[i];
      if (h.vendor === vendor && h.name === name && h.price) return h.price;
    }
    return 0;
  }

  // 각 팀별 분석: 4분류 + 비용 영향 + KPI
  const teamAnomalies = {};
  allTeams.forEach(team => {
    const thisItems = thisByTeam[team] || {};
    const past3Items = past3ByTeam[team] || {};
    const allKeys = new Set([...Object.keys(thisItems), ...Object.keys(past3Items)]);

    const ups = [], downs = [], news = [], gones = [];
    let thisCost = 0, pastTotalCost = 0;
    const allItems = [];  // TOP 변동 후보

    allKeys.forEach(k => {
      const thisQtyTotal = thisItems[k] ? thisItems[k].qty : 0;
      const pastQtyTotal = past3Items[k] ? past3Items[k].qty : 0;
      const meta = thisItems[k] || past3Items[k];
      const price = priceOfItem(meta.vendor, meta.name);

      // 비교 기준 단위: 진행 중 달이면 주평균, 완료된 달이면 월평균
      // (사용자 요구: 이번달 주평균 vs 직전 3개월 주평균 / 과거달 월총량 vs 직전 3개월 월평균)
      let thisVal, pastVal;
      if (isIncomplete) {
        thisVal = thisQtyTotal / thisWeeks;
        pastVal = pastQtyTotal / past3Weeks;
      } else {
        thisVal = thisQtyTotal;
        pastVal = pastQtyTotal / 3;
      }
      const deltaQty = thisVal - pastVal;
      const costImpact = deltaQty * price;

      thisCost += thisQtyTotal * price;
      pastTotalCost += pastQtyTotal * price;

      const row = {
        ...meta,
        thisQty: thisQtyTotal,
        thisVal: Math.round(thisVal * 10) / 10,
        pastVal: Math.round(pastVal * 10) / 10,
        pastAvg: Math.round((pastQtyTotal / 3) * 10) / 10,    // (구) 월평균 — 모달 호환
        price, deltaQty, costImpact
      };

      if (pastVal === 0 && thisVal > 0) {
        news.push(row);
        allItems.push({ ...row, kind: 'new', diffPct: null });
      } else if (pastVal > 0 && thisVal === 0) {
        row.diffPct = -100;
        gones.push(row);
        allItems.push({ ...row, kind: 'gone', diffPct: -100 });
      } else if (pastVal > 0) {
        const diffPct = ((thisVal - pastVal) / pastVal) * 100;
        row.diffPct = diffPct;
        if (diffPct >= 30) ups.push(row);
        else if (diffPct <= -30) downs.push(row);
        allItems.push({ ...row, kind: diffPct >= 30 ? 'up' : (diffPct <= -30 ? 'down' : 'stable'), diffPct });
      }
    });

    ups.sort((a, b) => b.diffPct - a.diffPct);
    downs.sort((a, b) => a.diffPct - b.diffPct);
    news.sort((a, b) => b.thisQty - a.thisQty);
    gones.sort((a, b) => b.pastAvg - a.pastAvg);

    // 비용 영향 TOP — 임계치 무시, 절대값으로 정렬
    const topByImpact = allItems
      .filter(it => it.kind !== 'stable' && Math.abs(it.costImpact) > 0)
      .sort((a, b) => Math.abs(b.costImpact) - Math.abs(a.costImpact))
      .slice(0, 5);

    // 비용 비교: 진행 중이면 주평균, 완료면 월평균
    const thisCostComp = isIncomplete ? (thisCost / thisWeeks) : thisCost;
    const pastCostComp = isIncomplete ? (pastTotalCost / past3Weeks) : (pastTotalCost / 3);
    const costDelta = thisCostComp - pastCostComp;
    const costDeltaPct = pastCostComp > 0 ? (costDelta / pastCostComp) * 100 : null;
    const pastAvgCost = pastTotalCost / 3;  // 표시용 월평균

    teamAnomalies[team] = {
      ups, downs, news, gones, topByImpact,
      thisCost, pastAvgCost,
      thisCostComp, pastCostComp, costDelta, costDeltaPct,
      thisWeeks, past3Weeks, isIncomplete,
      itemCount: allItems.length
    };
  });

  // 동료 팀 비교: 이번달 비용 기준 백분위
  const allTeamCosts = Object.entries(teamAnomalies)
    .map(([t, a]) => ({ team: t, cost: a.thisCost }))
    .filter(t => t.cost > 0)
    .sort((a, b) => b.cost - a.cost);
  const teamRankMap = {};
  allTeamCosts.forEach((t, i) => {
    teamRankMap[t.team] = { rank: i + 1, total: allTeamCosts.length, cost: t.cost };
  });

  // 팀 정렬: 설정 teams 순서 → 그 외(옛 팀명, 미지정) 뒤에
  const sortedTeams = Array.from(allTeams).sort((a, b) => {
    const ai = teams.indexOf(a);
    const bi = teams.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const monthLabel = thisMonthStart.getFullYear() + '년 ' + (thisMonthStart.getMonth() + 1) + '월';
  const isCurrentMonth = (() => {
    const n = new Date();
    return thisMonthStart.getFullYear() === n.getFullYear() &&
           thisMonthStart.getMonth() === n.getMonth();
  })();

  // 월 선택 드롭다운 옵션 생성 (history에 있는 가장 옛날 달 ~ 현재 달)
  const optionsHtml = buildAnomalyMonthOptions(thisMonthStart);

  // 비교 기간 라벨
  const past3Label = (threeMonthsAgoStart.getFullYear() + '.' + (threeMonthsAgoStart.getMonth() + 1)) +
                     ' ~ ' + (() => {
                       const last = new Date(thisMonthStart); last.setMonth(last.getMonth() - 1);
                       return last.getFullYear() + '.' + (last.getMonth() + 1);
                     })();

  // 안내 박스 + 월 선택 드롭다운 + 비교 방식 설명
  let html = '<div class="space-y-3">' +
    '<div class="bg-amber-50 border border-amber-200 rounded-2xl p-3">' +
    '<div class="flex items-center gap-2 flex-wrap mb-2">' +
    '<label class="text-xs font-bold text-slate-700">📅 비교 기준 월:</label>' +
    '<select onchange="changeAnomalyMonth(this.value)" class="px-2 py-1 text-xs bg-white border border-amber-300 rounded-lg font-bold text-slate-900 focus:outline-none focus:border-amber-500">' +
    optionsHtml +
    '</select>' +
    (anomalyMonth ? '<button onclick="changeAnomalyMonth(\'\')" class="text-[11px] px-2 py-1 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-slate-600">↩ 이번 달로</button>' : '') +
    (isIncomplete ? '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold">진행 중 (' + thisWeeks + '주차까지)</span>' : '') +
    '</div>' +
    '<p class="text-xs text-slate-700 leading-relaxed">' +
    '<strong>📈 ' + monthLabel + (isCurrentMonth ? ' (이번 달)' : '') + '</strong>' +
    (isIncomplete
      ? ' 진행 중인 달이라 <strong>주평균 사용량</strong>을 <strong>직전 3개월(' + past3Label + ') 주평균</strong>과 비교합니다.'
      : ' <strong>월 총 사용량</strong>을 <strong>직전 3개월(' + past3Label + ') 월평균</strong>과 비교합니다.') +
    '</p>' +
    '<p class="text-[11px] text-amber-700 mt-1">※ 위쪽 [기간 필터]는 적용되지 않습니다 (자체 기준 사용)</p>' +
    '</div>';

  // 데이터 없으면 안내
  if (allTeamCosts.length === 0) {
    html += '<div class="bg-white rounded-2xl border-2 border-slate-200 py-12 text-center">' +
      '<p class="text-4xl mb-2">📭</p>' +
      '<p class="text-sm text-slate-500">' + monthLabel + ' 출고 기록 없음</p>' +
      '</div></div>';
    return html;
  }

  // 팀별 카드 — 활동 있는 모든 팀 표시 (비용 큰 순)
  // 비활동 팀은 별도 처리
  const activeTeams = sortedTeams.filter(t => teamAnomalies[t] && (teamAnomalies[t].thisCost > 0 || teamAnomalies[t].pastAvgCost > 0));
  const sortedActive = activeTeams.slice().sort((a, b) => (teamAnomalies[b].thisCostComp || 0) - (teamAnomalies[a].thisCostComp || 0));

  sortedActive.forEach(team => {
    const a = teamAnomalies[team];
    const rank = teamRankMap[team];
    const totalChange = a.ups.length + a.downs.length + a.news.length + a.gones.length;

    // 변동률 색상
    const pct = a.costDeltaPct;
    let pctBadge = '';
    if (pct === null) {
      pctBadge = '<span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[11px] font-bold">신규 활동</span>';
    } else if (pct >= 30) {
      pctBadge = '<span class="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[11px] font-bold">▲ +' + Math.round(pct) + '%</span>';
    } else if (pct <= -30) {
      pctBadge = '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[11px] font-bold">▼ ' + Math.round(pct) + '%</span>';
    } else if (Math.abs(pct) > 5) {
      pctBadge = '<span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[11px] font-bold">' + (pct >= 0 ? '+' : '') + Math.round(pct) + '%</span>';
    } else {
      pctBadge = '<span class="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[11px] font-bold">≈ 평소 수준</span>';
    }

    const comment = getTeamAnomalyComment(a, isIncomplete, thisWeeks);

    // KPI 라벨/값: 진행 중이면 "주평균", 완료면 "월총량"
    const thisLabel = isIncomplete ? '주평균 (이번)' : '이번 달 총액';
    const pastLabel = isIncomplete ? '주평균 (지난 3개월)' : '월평균 (지난 3개월)';
    const thisValFmt = formatWonShort(a.thisCostComp);
    const pastValFmt = formatWonShort(a.pastCostComp);
    const accumFmt = formatWonShort(a.thisCost);  // 누계 (진행 중일 때 의미 있음)

    html += '<div class="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden">' +
      // 헤더
      '<div class="px-4 py-3 bg-slate-50 border-b border-slate-100">' +
      '<div class="flex items-center justify-between gap-2 flex-wrap">' +
      '<h3 class="font-bold text-slate-900">' + escapeHtml(team) + '</h3>' +
      '<div class="flex items-center gap-1.5 flex-wrap">' +
      pctBadge +
      (rank ? '<span class="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[11px] font-bold">팀 중 ' + rank.rank + '/' + rank.total + '위</span>' : '') +
      '<button onclick="openAnomalyDetail(\'' + escapeJs(team) + '\')" class="text-[11px] px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-full font-bold">📋 상세</button>' +
      '</div>' +
      '</div>' +
      // KPI 미니 그리드 (진행 중이면 3열: 누계+주평균이번+주평균지난, 완료면 2열: 월총+월평균지난)
      '<div class="grid ' + (isIncomplete ? 'grid-cols-3' : 'grid-cols-2') + ' gap-2 mt-2 text-[11px]">' +
      (isIncomplete ?
        '<div class="bg-white rounded-lg border border-slate-200 px-2 py-1.5">' +
        '<p class="text-slate-500">진행 누계</p>' +
        '<p class="font-bold text-slate-900 text-xs">' + accumFmt + '</p>' +
        '</div>'
        : '') +
      '<div class="bg-white rounded-lg border border-slate-200 px-2 py-1.5">' +
      '<p class="text-slate-500">' + thisLabel + '</p>' +
      '<p class="font-bold text-slate-900 text-xs">' + thisValFmt + '</p>' +
      '</div>' +
      '<div class="bg-white rounded-lg border border-slate-200 px-2 py-1.5">' +
      '<p class="text-slate-500">' + pastLabel + '</p>' +
      '<p class="font-bold text-slate-700 text-xs">' + pastValFmt + '</p>' +
      '</div>' +
      '</div>' +
      // 변동 카운트 (있을 때만)
      (totalChange > 0 ?
        '<div class="flex gap-1.5 text-[10px] font-bold mt-2">' +
        (a.ups.length > 0   ? '<span class="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">🔺 급증 ' + a.ups.length + '</span>' : '') +
        (a.downs.length > 0 ? '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">🔻 감소 ' + a.downs.length + '</span>' : '') +
        (a.news.length > 0  ? '<span class="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">🆕 신규 ' + a.news.length + '</span>' : '') +
        (a.gones.length > 0 ? '<span class="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full">⏸ 중단 ' + a.gones.length + '</span>' : '') +
        '</div>'
        : '') +
      '</div>' +
      // 본문 코멘트 + TOP 변동
      '<div class="px-4 py-3 space-y-2">' +
      (comment ? '<p class="text-xs text-slate-700 leading-relaxed">' + comment + '</p>' : '') +
      renderTeamTopImpact(a) +
      '</div>' +
      '</div>';
  });

  html += '</div>';

  // 모달용 데이터 보관
  window._anomalyData = { teamAnomalies, monthLabel, isIncomplete, thisWeeks, past3Weeks };

  return html;
}

// 팀별 비용 영향 TOP 3 — 카드 본문에 항상 표시 (임계치 무관)
function renderTeamTopImpact(a) {
  if (!a.topByImpact || a.topByImpact.length === 0) return '';
  const unit = a.isIncomplete ? '/주' : '/월';
  let html = '<div class="border border-slate-100 rounded-lg p-2 bg-slate-50">' +
    '<p class="text-[10px] font-bold text-slate-500 mb-1">📊 비용 영향 TOP 3 (' + unit + ' 기준)</p>' +
    '<div class="space-y-0.5 text-[11px]">';
  a.topByImpact.slice(0, 3).forEach(it => {
    let kindIcon, colorCls;
    if (it.kind === 'up')        { kindIcon = '▲'; colorCls = 'text-red-700'; }
    else if (it.kind === 'down') { kindIcon = '▼'; colorCls = 'text-blue-700'; }
    else if (it.kind === 'new')  { kindIcon = '★'; colorCls = 'text-emerald-700'; }
    else                          { kindIcon = '⏸'; colorCls = 'text-slate-600'; }
    const before = it.kind === 'new' ? '0' : it.pastVal;
    const after = it.kind === 'gone' ? '0' : it.thisVal;
    const sign = it.costImpact >= 0 ? '+' : '';
    const impactFmt = sign + formatWonShort(it.costImpact) + unit;
    const impactColor = it.costImpact > 0 ? 'text-red-600' : 'text-emerald-600';
    html += '<p>' +
      '<span class="' + colorCls + ' font-bold">' + kindIcon + '</span> ' +
      '<strong>' + escapeHtml(it.name) + '</strong>: ' +
      before + ' → ' + after + (it.kind === 'new' || it.kind === 'gone' ? '' : ' (' + (it.diffPct >= 0 ? '+' : '') + Math.round(it.diffPct) + '%)') +
      ' <span class="' + impactColor + ' font-bold">' + impactFmt + '</span>' +
      '</p>';
  });
  html += '</div></div>';
  return html;
}

// 팀별 분석 코멘트 — 패턴 기반 학술적/실무적 인사이트
// - 사용량 변동 패턴 분석 (환자 수 시그널, 시술 변경 등)
// - 비용 영향 정량화
// - 실행 가능한 권고
function getTeamAnomalyComment(a, isIncomplete, thisWeeks) {
  // 비용 영향 합산 (주/월 단위 — isIncomplete에 따라 단위 다름)
  const unit = isIncomplete ? '/주' : '/월';
  const positiveImpact = a.topByImpact.filter(it => it.costImpact > 0)
    .reduce((s, it) => s + it.costImpact, 0);
  const negativeImpact = a.topByImpact.filter(it => it.costImpact < 0)
    .reduce((s, it) => s + Math.abs(it.costImpact), 0);
  const netImpact = positiveImpact - negativeImpact;

  // 패턴 시그널 (학술적/실무적 인사이트)
  const signals = [];
  const upCount = a.ups.length;
  const downCount = a.downs.length;
  const newCount = a.news.length;
  const goneCount = a.gones.length;

  // 1) 환자 수/시술량 시그널 — 다수 품목이 같은 방향
  if (upCount >= 3 && downCount === 0) {
    signals.push('👥 다수 품목 사용량 증가 → <strong>환자 수/시술량 증가 시그널</strong>');
  } else if (downCount >= 3 && upCount === 0) {
    signals.push('📉 다수 품목 사용량 감소 → <strong>환자 수/시술량 감소</strong> 또는 <strong>대체재 도입</strong>');
  } else if (upCount >= 2 && downCount >= 2) {
    signals.push('🔄 일부 품목 ↑, 일부 ↓ → <strong>시술 구성 변화</strong> 또는 <strong>치료 프로토콜 변경</strong>');
  }

  // 2) 신규 사용 시그널
  if (newCount >= 2) {
    signals.push('✨ ' + newCount + '개 신규 품목 사용 → <strong>새 시술/재료 도입</strong> 가능성');
  } else if (newCount === 1) {
    const newItem = a.news[0];
    signals.push('✨ <strong>' + escapeHtml(newItem.name) + '</strong> 신규 사용 시작');
  }

  // 3) 사용 중단 시그널
  if (goneCount >= 2) {
    signals.push('⏸ ' + goneCount + '개 품목 사용 중단 → <strong>재고 정리 검토</strong> 필요');
  }

  // 4) 비용 영향 정량화
  let costMsg = '';
  if (Math.abs(netImpact) > 1000) {
    if (netImpact > 0) {
      costMsg = '💰 평소 대비 <strong class="text-red-700">+' + formatWonShort(netImpact) + unit + '</strong> 추가 지출';
    } else {
      costMsg = '💰 평소 대비 <strong class="text-emerald-700">-' + formatWonShort(Math.abs(netImpact)) + unit + '</strong> 절약';
    }
  }

  // 5) 안정/평소 수준
  if (signals.length === 0 && Math.abs(netImpact) < 1000) {
    if (a.thisCost === 0 && a.pastAvgCost > 0) {
      return '⚠️ <strong>이번 ' + (isIncomplete ? '진행 기간' : '달') + ' 출고 없음</strong> — 운영 중단? 데이터 누락 확인 필요';
    }
    if (a.thisCost > 0) {
      return '✅ 평소와 비슷한 사용 패턴 — 안정적 운영';
    }
    return '';
  }

  // 종합 메시지
  let msg = '';
  if (costMsg) msg += costMsg + '<br>';
  msg += signals.join('<br>');
  return msg;
}

// ============================================
// 이상치 팀별 상세 모달
// ============================================
// 카드의 [📋 상세] 버튼 클릭 시 호출. 더 큰 화면으로 풀 정보 표시.
function openAnomalyDetail(teamName) {
  if (!window._anomalyData || !window._anomalyData.teamAnomalies[teamName]) return;
  const a = window._anomalyData.teamAnomalies[teamName];
  const monthLabel = window._anomalyData.monthLabel;
  const comment = getTeamAnomalyComment(a);
  const total = a.ups.length + a.downs.length + a.news.length + a.gones.length;

  function bigSection(title, items, kind, bgColor, borderColor, textColor) {
    if (items.length === 0) return '';
    let body = '<div class="divide-y divide-slate-100">';
    items.forEach(it => {
      let diffHtml = '';
      if (kind === 'up')        diffHtml = '<span class="font-bold ' + textColor + '">+' + Math.round(it.diffPct) + '%</span>';
      else if (kind === 'down') diffHtml = '<span class="font-bold ' + textColor + '">' + Math.round(it.diffPct) + '%</span>';
      else if (kind === 'new')  diffHtml = '<span class="font-bold ' + textColor + '">신규</span>';
      else if (kind === 'gone') diffHtml = '<span class="font-bold ' + textColor + '">중단</span>';
      body += '<div class="flex items-center text-sm py-3 px-4 gap-3">' +
        '<div class="flex-1 min-w-0">' +
        '<p class="text-xs text-slate-500 truncate">' + escapeHtml(it.vendor) + '</p>' +
        '<p class="text-slate-900 font-medium truncate">' + escapeHtml(it.name) + '</p>' +
        '</div>' +
        '<div class="text-right shrink-0">' +
        '<p class="text-xs text-slate-500">이번 ' + it.thisQty + ' / 평균 ' + it.pastAvg + '</p>' +
        '<p class="text-base mt-0.5">' + diffHtml + '</p>' +
        '</div>' +
        '</div>';
    });
    body += '</div>';
    return '<section class="rounded-xl overflow-hidden border ' + borderColor + '">' +
      '<div class="px-4 py-2.5 ' + bgColor + ' border-b ' + borderColor + ' flex items-center justify-between">' +
      '<p class="font-bold text-sm ' + textColor + '">' + title + '</p>' +
      '<span class="text-xs font-normal text-slate-500">' + items.length + '종</span>' +
      '</div>' + body + '</section>';
  }

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-amber-50 border-b border-amber-200">' +
    '<div class="flex items-center justify-between gap-2">' +
    '<div>' +
    '<h3 class="text-base font-bold text-slate-900">📈 ' + escapeHtml(teamName) + ' 이상 사용량</h3>' +
    '<p class="text-xs text-slate-500 mt-0.5">' + escapeHtml(monthLabel) + ' / 이상치 ' + total + '건</p>' +
    '</div>' +
    '<button onclick="closeModal()" class="text-slate-400 hover:text-slate-700 px-2 py-1">✕</button>' +
    '</div></div>' +
    '<div class="overflow-y-auto flex-1 px-5 py-4 space-y-4">' +
    (comment ? '<div class="bg-amber-50/50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-slate-800">' + comment + '</div>' : '') +
    bigSection('🔺 급증 — 평소보다 많이 사용 중', a.ups,   'up',   'bg-red-50',     'border-red-200',     'text-red-700') +
    bigSection('🔻 급감 — 평소보다 적게 사용 중', a.downs, 'down', 'bg-blue-50',    'border-blue-200',    'text-blue-700') +
    bigSection('🆕 신규 사용 — 지난 3개월에 없던 품목', a.news, 'new', 'bg-emerald-50', 'border-emerald-200', 'text-emerald-700') +
    bigSection('⏸ 사용 중단 — 평소엔 썼지만 이번 달 0건', a.gones, 'gone', 'bg-slate-50', 'border-slate-200', 'text-slate-700') +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t">' +
    '<button onclick="closeModal()" class="w-full py-3 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-bold">닫기</button>' +
    '</div></div></div>';

  document.getElementById('modal-container').innerHTML = html;
}

// 한 분류의 행들을 렌더 (팀 카드 내부에서 호출)
function renderAnomalyRows(items, kind) {
  if (items.length === 0) return '';
  const meta = {
    up:   { label: '🔺 급증', valColor: 'text-red-600',     bg: 'bg-red-50/40' },
    down: { label: '🔻 급감', valColor: 'text-blue-600',    bg: 'bg-blue-50/40' },
    new:  { label: '🆕 신규', valColor: 'text-emerald-600', bg: 'bg-emerald-50/40' },
    gone: { label: '⏸ 중단', valColor: 'text-slate-500',   bg: 'bg-slate-50/60' }
  };
  const m = meta[kind];
  let html = '';
  items.forEach(it => {
    let diffHtml = '';
    if (kind === 'up')        diffHtml = '<span class="font-bold ' + m.valColor + '">+' + Math.round(it.diffPct) + '%</span>';
    else if (kind === 'down') diffHtml = '<span class="font-bold ' + m.valColor + '">' + Math.round(it.diffPct) + '%</span>';
    else if (kind === 'new')  diffHtml = '<span class="font-bold ' + m.valColor + '">신규</span>';
    else if (kind === 'gone') diffHtml = '<span class="font-bold ' + m.valColor + '">중단</span>';

    html += '<div class="flex items-center text-xs py-2 px-4 gap-2 ' + m.bg + '">' +
      '<span class="text-[10px] font-bold ' + m.valColor + ' shrink-0 w-10">' + m.label + '</span>' +
      '<div class="flex-1 min-w-0">' +
      '<p class="text-[11px] text-slate-500 truncate">' + escapeHtml(it.vendor) + '</p>' +
      '<p class="text-slate-800 truncate">' + escapeHtml(it.name) + '</p>' +
      '</div>' +
      '<div class="text-right shrink-0">' +
      '<p class="text-[11px] text-slate-500">이번 ' + it.thisQty + ' / 평균 ' + it.pastAvg + '</p>' +
      '<p>' + diffHtml + '</p>' +
      '</div>' +
      '</div>';
  });
  return html;
}
