// ============================================
// 8-manage.js: 요청관리 화면
// ============================================
// 의존: 모든 이전 모듈
// 호출자: 99-main.js의 switchTab('manage')

let manageStatusFilter = 'pending'; // pending/completed
let manageFilter = 'all'; // all/today/week
let manageTeamFilter = '';

// 기존 데이터 호환: status가 없으면 'completed'로 간주
function getReqStatus(r) {
  return r.status || 'completed';
}

function renderManage() {
  // status 필터 먼저 적용
  let filtered = requests.filter(r => getReqStatus(r) === manageStatusFilter);
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  
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
  
  // 상태별 카운트
  const pendingCount = requests.filter(r => getReqStatus(r) === 'pending').length;
  const completedCount = requests.filter(r => getReqStatus(r) === 'completed').length;
  
  // 통계 (현재 status 필터 기준)
  const statusFiltered = requests.filter(r => getReqStatus(r) === manageStatusFilter);
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = statusFiltered.filter(r => r.date.slice(0, 10) === today).length;
  const weekDate = new Date();
  weekDate.setDate(weekDate.getDate() - 7);
  const weekCount = statusFiltered.filter(r => new Date(r.date) >= weekDate).length;
  
  // 요청 ID별 그룹핑
  const grouped = {};
  filtered.forEach(r => {
    const key = r.requestId || r.id;
    if (!grouped[key]) {
      grouped[key] = { requestId: key, date: r.date, team: r.team, requester: r.requester, status: getReqStatus(r), items: [] };
    }
    grouped[key].items.push(r);
  });
  const groups = Object.values(grouped).sort((a, b) => new Date(b.date) - new Date(a.date));
  
  let html = '<div class="space-y-4">' +
    '<div class="bg-blue-50 border border-blue-200 rounded-2xl p-4">' +
    '<h2 class="text-lg font-bold text-slate-900 mb-1">📋 반출 요청 관리</h2>' +
    '<p class="text-sm text-slate-600"><strong class="text-amber-700">대기</strong> 중인 요청을 확인하고 <strong class="text-emerald-700">반출 완료</strong> 처리합니다</p></div>' +
    
    // 상태 탭 (대기 / 완료)
    '<div class="grid grid-cols-2 gap-2">' +
    '<button onclick="manageStatusFilter = \'pending\'; renderManage();" class="rounded-xl p-4 border-2 transition ' +
    (manageStatusFilter === 'pending' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300') + '">' +
    '<p class="text-xs ' + (manageStatusFilter === 'pending' ? 'text-amber-700' : 'text-slate-500') + ' font-bold">⏳ 반출 대기</p>' +
    '<p class="text-3xl font-bold ' + (manageStatusFilter === 'pending' ? 'text-amber-600' : 'text-slate-700') + '">' + pendingCount + '</p>' +
    '</button>' +
    '<button onclick="manageStatusFilter = \'completed\'; renderManage();" class="rounded-xl p-4 border-2 transition ' +
    (manageStatusFilter === 'completed' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300') + '">' +
    '<p class="text-xs ' + (manageStatusFilter === 'completed' ? 'text-emerald-700' : 'text-slate-500') + ' font-bold">✅ 반출 완료</p>' +
    '<p class="text-3xl font-bold ' + (manageStatusFilter === 'completed' ? 'text-emerald-600' : 'text-slate-700') + '">' + completedCount + '</p>' +
    '</button>' +
    '</div>' +
    
    // 기간 필터 카드
    '<div class="grid grid-cols-3 gap-2">' +
    '<button onclick="manageFilter = \'all\'; renderManage();" class="bg-white rounded-xl p-3 border-2 ' + 
    (manageFilter === 'all' ? 'border-blue-500' : 'border-slate-200') + ' transition">' +
    '<p class="text-xs text-slate-500">전체</p><p class="text-2xl font-bold text-slate-900">' + statusFiltered.length + '</p></button>' +
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
    const emptyMsg = manageStatusFilter === 'pending' 
      ? '대기 중인 반출 요청이 없습니다' 
      : '완료된 반출 내역이 없습니다';
    html += '<div class="py-12 text-center text-slate-400">' +
      '<p class="text-4xl mb-2">📭</p>' +
      '<p class="text-sm">' + emptyMsg + '</p></div>';
  } else {
    groups.forEach(g => {
      const dt = new Date(g.date);
      const dateStr = (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + 
        String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
      const totalQty = g.items.reduce((s, i) => s + i.qty, 0);
      const isPending = g.status === 'pending';
      
      // 재고 부족 체크 (대기 상태일 때만)
      let insufficientItems = [];
      if (isPending) {
        insufficientItems = g.items.filter(it => {
          const item = inventory.find(i => i.id === it.itemId);
          return item && it.qty > item.stock;
        });
      }
      
      html += '<div class="px-4 py-3 hover:bg-slate-50 ' + (isPending ? 'bg-amber-50/30' : '') + '">' +
        '<div class="flex items-center justify-between mb-2">' +
        '<div class="flex items-center gap-2 flex-wrap">' +
        '<span class="text-xs text-slate-500">' + dateStr + '</span>' +
        '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">' + escapeHtml(g.team) + '</span>' +
        '<span class="text-xs text-slate-700">' + escapeHtml(g.requester) + '님</span>' +
        (isPending ? '<span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">⏳ 대기</span>' 
                   : '<span class="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">✅ 완료</span>') +
        '</div>' +
        '<div class="flex items-center gap-2">' +
        '<span class="text-sm font-bold text-slate-900">' + g.items.length + '종 · ' + totalQty + '개</span>' +
        '<button onclick="deleteRequestGroup(\'' + g.requestId + '\')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="요청 삭제">🗑️</button>' +
        '</div></div>' +
        '<div class="space-y-1 ml-2">';
      g.items.forEach(it => {
        const item = inventory.find(i => i.id === it.itemId);
        const isShort = isPending && item && it.qty > item.stock;
        html += '<div class="flex items-center text-xs text-slate-600 py-1">' +
          '<span class="text-slate-400 mr-2">·</span>' +
          '<span class="text-slate-500 mr-2">' + escapeHtml(it.vendor) + '</span>' +
          '<span class="flex-1">' + escapeHtml(it.name) + '</span>' +
          (isShort ? '<span class="text-xs text-amber-700 font-bold mr-2">⚠️ 재고 ' + item.stock + it.unit + '</span>' : '') +
          '<span class="font-bold ' + (isShort ? 'text-amber-700' : 'text-blue-600') + ' ml-2">' + it.qty + escapeHtml(it.unit) + '</span>' +
          '</div>';
      });
      html += '</div>';
      
      // 대기 상태일 때만 "반출 완료" 버튼 표시
      if (isPending) {
        if (insufficientItems.length > 0) {
          html += '<div class="mt-2 px-3 py-2 bg-amber-100 border border-amber-300 rounded-lg text-xs text-amber-800">' +
            '⚠️ ' + insufficientItems.length + '개 품목이 재고보다 많습니다. 완료 처리 시 재고가 마이너스가 됩니다.' +
            '</div>';
        }
        html += '<div class="mt-3 flex justify-end">' +
          '<button onclick="completeRequest(\'' + g.requestId + '\')" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm shadow-sm">' +
          '✅ 반출 완료 처리</button>' +
          '</div>';
      }
      
      html += '</div>';
    });
  }
  
  html += '</div></div>';
  document.getElementById('page-content').innerHTML = html;
}

// ============================================
// 반출 완료 처리: 대기 → 완료
// 이 시점에 재고 차감 + 이력 기록
// ============================================
function completeRequest(requestId) {
  const items = requests.filter(r => (r.requestId === requestId) && getReqStatus(r) === 'pending');
  if (items.length === 0) return;
  
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const insufficient = items.filter(it => {
    const item = inventory.find(i => i.id === it.itemId);
    return item && it.qty > item.stock;
  });
  
  let message = '[' + items[0].team + '] ' + items[0].requester + '님의 요청을 반출 완료 처리합니다.\n\n';
  message += items.map(function(it) { return '· ' + it.name + ' ' + it.qty + it.unit; }).join('\n');
  message += '\n\n총 ' + totalQty + '개의 재고가 차감됩니다.';
  if (insufficient.length > 0) {
    message += '\n\n⚠️ 주의: ' + insufficient.length + '개 품목이 재고보다 많아 마이너스가 됩니다.';
  }
  
  askConfirm('반출 완료 처리', message, function() {
    const completeDate = new Date().toISOString();
    
    items.forEach(it => {
      const item = inventory.find(i => i.id === it.itemId);
      if (item) {
        // 재고 차감
        item.stock -= it.qty;
        // 이력 기록
        history.push({
          id: 'H' + Date.now() + '_' + it.itemId,
          type: 'out',
          date: completeDate,
          itemId: it.itemId,
          vendor: it.vendor,
          name: it.name,
          qty: it.qty,
          unit: it.unit,
          team: it.team,
          requester: it.requester,
          requestId: requestId
        });
      }
      // 요청 status 변경
      it.status = 'completed';
      it.completedDate = completeDate;
    });
    
    saveAll();
    updateHeaderStats();
    showToast('반출 완료 처리됨! ' + items.length + '종 ' + totalQty + '개 재고 차감', 'success');
    renderManage();
  }, '예, 완료 처리', 'emerald');
}

// ============================================
// 요청 삭제 (대기/완료 모두 처리)
// ============================================
function deleteRequestGroup(requestId) {
  const items = requests.filter(r => r.requestId === requestId);
  if (items.length === 0) return;
  
  const isPending = getReqStatus(items[0]) === 'pending';
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  
  let title, message, confirmText;
  if (isPending) {
    // 대기 상태: 그냥 삭제 (재고 변동 없음)
    title = '대기 요청 삭제';
    message = '이 반출 요청을 삭제하시겠습니까?\n\n총 ' + items.length + '종 ' + totalQty + '개\n\n💡 아직 재고가 차감되지 않아 복원이 필요 없습니다.';
    confirmText = '예, 삭제';
  } else {
    // 완료 상태: 재고 복원 + 이력 삭제
    title = '완료 요청 취소';
    message = '이 반출 요청을 취소하시겠습니까?\n\n취소된 수량은 재고로 복원됩니다.\n총 ' + items.length + '종 ' + totalQty + '개';
    confirmText = '예, 취소';
  }
  
  askConfirm(title, message, function() {
    if (!isPending) {
      // 완료 상태였으면 재고 복원
      items.forEach(it => {
        const item = inventory.find(i => i.id === it.itemId);
        if (item) item.stock += it.qty;
      });
      // 이력에서 삭제
      history = history.filter(h => h.requestId !== requestId);
    }
    // 요청에서 삭제
    requests = requests.filter(r => r.requestId !== requestId);
    saveAll();
    updateHeaderStats();
    showToast(isPending ? '대기 요청이 삭제되었습니다' : '완료 요청이 취소되고 재고가 복원되었습니다');
    renderManage();
  }, confirmText, 'red');
}
