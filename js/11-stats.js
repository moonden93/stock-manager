// ============================================
// 11-stats.js: 통계 화면
// ============================================
// 의존: 4-utils.js (getWeekKey, formatWeekLabel, formatWon, formatWonShort)
//       14-export.js (exportStatsToExcel)
//       모든 이전 모듈
// 호출자: 99-main.js의 switchTab('stats')

// ============================================================
let statsTab = 'team'; // team / vendor / weekly
let statsPeriod = 'all'; // all / month / week / custom
let statsCustomStart = ''; // YYYY-MM-DD
let statsCustomEnd = '';   // YYYY-MM-DD

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
    '<div class="flex bg-slate-100 rounded-xl p-1">' +
    '<button onclick="statsTab = \'team\'; renderStats();" class="flex-1 py-2 rounded-lg font-bold text-sm transition ' +
    (statsTab === 'team' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600') + '">👥 팀별</button>' +
    '<button onclick="statsTab = \'vendor\'; renderStats();" class="flex-1 py-2 rounded-lg font-bold text-sm transition ' +
    (statsTab === 'vendor' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600') + '">🏢 업체별</button>' +
    '<button onclick="statsTab = \'weekly\'; renderStats();" class="flex-1 py-2 rounded-lg font-bold text-sm transition ' +
    (statsTab === 'weekly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600') + '">📅 주차별</button>' +
    '</div>';
  
  if (totalQty === 0) {
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
