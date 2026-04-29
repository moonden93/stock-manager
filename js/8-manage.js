// ============================================
// 8-manage.js: 요청관리 화면
// ============================================
// 의존: 모든 이전 모듈
// 호출자: 99-main.js의 switchTab('manage')

let manageFilter = 'all'; // all/today/week
let manageTeamFilter = '';

function renderManage() {
  let filtered = [...requests].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (manageFilter === 'today') {
    const today = new Date().toISOString().slice(0, 10);
    filtered = filtered.filter(r => r.date.slice(0, 10) === today);
  } else if (manageFilter === 'week') {
    const wk = new Date();
    wk.setDate(wk.getDate() - 7);
    filtered = filtered.filter(r => new Date(r.date) >= wk);
  }
  
  if (manageTeamFilter) {
    filtered = filtered.filter(r => r.team === manageTeamFilter);
  }
  
  // 통계
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = requests.filter(r => r.date.slice(0, 10) === today).length;
  const weekDate = new Date();
  weekDate.setDate(weekDate.getDate() - 7);
  const weekCount = requests.filter(r => new Date(r.date) >= weekDate).length;
  
  // 팀별 그룹핑 (요청 일자별로)
  const grouped = {};
  filtered.forEach(r => {
    const key = r.requestId || r.id;
    if (!grouped[key]) {
      grouped[key] = { requestId: key, date: r.date, team: r.team, requester: r.requester, items: [] };
    }
    grouped[key].items.push(r);
  });
  const groups = Object.values(grouped).sort((a, b) => new Date(b.date) - new Date(a.date));
  
  let html = '<div class="space-y-4">' +
    '<div class="bg-blue-50 border border-blue-200 rounded-2xl p-4">' +
    '<h2 class="text-lg font-bold text-slate-900 mb-1">📋 반출 요청 관리</h2>' +
    '<p class="text-sm text-slate-600">반출한 내역을 확인하고 관리합니다 (수정/취소 가능)</p></div>' +
    
    // 필터 카드
    '<div class="grid grid-cols-3 gap-2">' +
    '<button onclick="manageFilter = \'all\'; renderManage();" class="bg-white rounded-xl p-3 border-2 ' + 
    (manageFilter === 'all' ? 'border-blue-500' : 'border-slate-200') + ' transition">' +
    '<p class="text-xs text-slate-500">전체</p><p class="text-2xl font-bold text-slate-900">' + requests.length + '</p></button>' +
    '<button onclick="manageFilter = \'week\'; renderManage();" class="bg-white rounded-xl p-3 border-2 ' +
    (manageFilter === 'week' ? 'border-blue-500' : 'border-slate-200') + ' transition">' +
    '<p class="text-xs text-slate-500">최근 7일</p><p class="text-2xl font-bold text-blue-600">' + weekCount + '</p></button>' +
    '<button onclick="manageFilter = \'today\'; renderManage();" class="bg-white rounded-xl p-3 border-2 ' +
    (manageFilter === 'today' ? 'border-blue-500' : 'border-slate-200') + ' transition">' +
    '<p class="text-xs text-slate-500">오늘</p><p class="text-2xl font-bold text-emerald-600">' + todayCount + '</p></button>' +
    '</div>' +
    
    // 팀 필터
    '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">' +
    '<div class="px-3 py-3 border-b border-slate-100"><p class="text-xs text-slate-500 mb-2">팀별 필터:</p>' +
    '<div class="flex flex-wrap gap-1">' +
    '<button onclick="manageTeamFilter = \'\'; renderManage();" class="px-3 py-1.5 text-sm rounded-full ' +
    (!manageTeamFilter ? 'bg-blue-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">전체</button>';
  
  teams.forEach(t => {
    html += '<button onclick="manageTeamFilter = \'' + escapeJs(t) + '\'; renderManage();" class="px-3 py-1.5 text-sm rounded-full ' +
      (manageTeamFilter === t ? 'bg-blue-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">' + escapeHtml(t) + '</button>';
  });
  html += '</div></div>';
  
  // 요청 목록 (그룹별)
  html += '<div class="max-h-[600px] overflow-y-auto divide-y-2 divide-slate-100">';
  
  if (groups.length === 0) {
    html += '<div class="py-12 text-center text-slate-400">' +
      '<p class="text-4xl mb-2">📭</p>' +
      '<p class="text-sm">반출 요청 내역이 없습니다</p></div>';
  } else {
    groups.forEach(g => {
      const dt = new Date(g.date);
      const dateStr = (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + 
        String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
      const totalQty = g.items.reduce((s, i) => s + i.qty, 0);
      
      html += '<div class="px-4 py-3 hover:bg-slate-50">' +
        '<div class="flex items-center justify-between mb-2">' +
        '<div class="flex items-center gap-2 flex-wrap">' +
        '<span class="text-xs text-slate-500">' + dateStr + '</span>' +
        '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">' + escapeHtml(g.team) + '</span>' +
        '<span class="text-xs text-slate-700">' + escapeHtml(g.requester) + '님</span></div>' +
        '<div class="flex items-center gap-2">' +
        '<span class="text-sm font-bold text-slate-900">' + g.items.length + '종 · ' + totalQty + '개</span>' +
        '<button onclick="deleteRequestGroup(\'' + g.requestId + '\')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">🗑️</button>' +
        '</div></div>' +
        '<div class="space-y-1 ml-2">';
      g.items.forEach(it => {
        html += '<div class="flex items-center text-xs text-slate-600 py-1">' +
          '<span class="text-slate-400 mr-2">·</span>' +
          '<span class="text-slate-500 mr-2">' + escapeHtml(it.vendor) + '</span>' +
          '<span class="flex-1">' + escapeHtml(it.name) + '</span>' +
          '<span class="font-bold text-blue-600 ml-2">' + it.qty + escapeHtml(it.unit) + '</span>' +
          '</div>';
      });
      html += '</div></div>';
    });
  }
  
  html += '</div></div></div>';
  document.getElementById('page-content').innerHTML = html;
}

function deleteRequestGroup(requestId) {
  const items = requests.filter(r => r.requestId === requestId);
  if (items.length === 0) return;
  
  askConfirm('요청 취소', '이 반출 요청을 취소하시겠습니까?\n\n취소된 수량은 재고로 복원됩니다.\n총 ' + items.length + '종 ' + items.reduce((s, i) => s + i.qty, 0) + '개', function() {
    // 재고 복원
    items.forEach(it => {
      const item = inventory.find(i => i.id === it.itemId);
      if (item) item.stock += it.qty;
    });
    // 이력에서 삭제
    history = history.filter(h => h.requestId !== requestId);
    // 요청에서 삭제
    requests = requests.filter(r => r.requestId !== requestId);
    saveAll();
    updateHeaderStats();
    showToast('요청이 취소되고 재고가 복원되었습니다');
    renderManage();
  }, '예, 취소', 'red');
}
