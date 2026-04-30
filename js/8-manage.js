// ============================================
// 8-manage.js: 요청관리 화면
// ============================================
// 의존: 모든 이전 모듈
// 호출자: 99-main.js의 switchTab('manage')

let manageStatusFilter = 'pending'; // pending/completed
let manageFilter = 'all'; // all/today/week
let manageTeamFilter = '';

// 선택 상태: { requestId: { itemId(요청id): { checked: bool, qty: number } } }
let manageSelection = {};

// 기존 데이터 호환: status가 없으면 'completed'로 간주
function getReqStatus(r) {
  return r.status || 'completed';
}

// 선택 상태 초기화 (요청 그룹별로 모두 체크 + 원래 수량)
function ensureSelection(requestId, items) {
  if (!manageSelection[requestId]) {
    manageSelection[requestId] = {};
  }
  items.forEach(it => {
    if (!manageSelection[requestId][it.id]) {
      manageSelection[requestId][it.id] = { checked: true, qty: it.qty };
    }
  });
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
      
      // 대기 상태일 때만 선택 상태 초기화
      if (isPending) {
        ensureSelection(g.requestId, g.items);
      }
      
      // 선택된 항목 통계
      let selectedCount = 0, selectedQty = 0;
      if (isPending) {
        g.items.forEach(it => {
          const sel = manageSelection[g.requestId][it.id];
          if (sel && sel.checked) {
            selectedCount++;
            selectedQty += sel.qty;
          }
        });
      }
      const allSelected = isPending && selectedCount === g.items.length;
      
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
        '</div></div>';
      
      // 대기 상태: 전체선택 바 추가
      if (isPending) {
        html += '<div class="flex items-center justify-between px-2 py-2 mb-2 bg-white rounded-lg border border-slate-200">' +
          '<label class="flex items-center gap-2 cursor-pointer">' +
          '<input type="checkbox" ' + (allSelected ? 'checked' : '') + ' ' +
          'onchange="toggleSelectAll(\'' + g.requestId + '\', this.checked)" ' +
          'class="w-5 h-5 accent-emerald-600 cursor-pointer" />' +
          '<span class="text-sm font-bold text-slate-700">전체선택</span>' +
          '</label>' +
          '<span class="text-xs text-slate-500">' + selectedCount + '/' + g.items.length + ' 선택 · ' + selectedQty + '개</span>' +
          '</div>';
      }
      
      html += '<div class="space-y-1 ml-2">';
      g.items.forEach(it => {
        const item = inventory.find(i => i.id === it.itemId);
        const stock = item ? item.stock : 0;
        
        if (isPending) {
          // 대기 상태: 체크박스 + 수량조절 UI
          const sel = manageSelection[g.requestId][it.id];
          const isChecked = sel.checked;
          const releaseQty = sel.qty;
          const isShort = isChecked && releaseQty > stock;
          
          html += '<div class="flex items-center gap-2 py-2 px-2 ' + (isChecked ? 'bg-white' : 'bg-slate-100 opacity-60') + ' rounded-lg border border-slate-100">' +
            '<input type="checkbox" ' + (isChecked ? 'checked' : '') + ' ' +
            'onchange="toggleItemCheck(\'' + g.requestId + '\', \'' + it.id + '\', this.checked)" ' +
            'class="w-5 h-5 accent-emerald-600 cursor-pointer flex-shrink-0" />' +
            '<div class="flex-1 min-w-0">' +
            '<p class="text-xs text-slate-500">' + escapeHtml(it.vendor) + '</p>' +
            '<p class="text-sm text-slate-800 truncate">' + escapeHtml(it.name) + '</p>' +
            '<p class="text-xs text-slate-500">요청 ' + it.qty + escapeHtml(it.unit) + ' · 재고 ' + stock + escapeHtml(it.unit) +
            (isShort ? ' <span class="text-amber-700 font-bold">⚠️ 재고 부족</span>' : '') + '</p>' +
            '</div>';
          
          if (isChecked) {
            // 수량 조절 버튼
            html += '<div class="flex items-center gap-1 flex-shrink-0">' +
              '<button onclick="changeReleaseQty(\'' + g.requestId + '\', \'' + it.id + '\', -1)" ' +
              'class="w-8 h-8 bg-slate-200 hover:bg-slate-300 rounded text-base font-bold">−</button>' +
              '<input type="number" value="' + releaseQty + '" min="1" max="' + it.qty + '" ' +
              'onchange="setReleaseQty(\'' + g.requestId + '\', \'' + it.id + '\', this.value, ' + it.qty + ')" ' +
              'onfocus="this.select()" ' +
              'class="w-12 h-8 text-center font-bold bg-white border-2 ' + (isShort ? 'border-amber-400' : 'border-slate-200') + ' rounded text-sm" />' +
              '<button onclick="changeReleaseQty(\'' + g.requestId + '\', \'' + it.id + '\', 1)" ' +
              'class="w-8 h-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-base font-bold">+</button>' +
              '<span class="text-xs text-slate-500 ml-1">' + escapeHtml(it.unit) + '</span>' +
              '</div>';
          } else {
            html += '<span class="text-xs text-slate-400 px-2">제외</span>';
          }
          
          html += '</div>';
        } else {
          // 완료 상태: 기존 표시 방식
          html += '<div class="flex items-center text-xs text-slate-600 py-1">' +
            '<span class="text-slate-400 mr-2">·</span>' +
            '<span class="text-slate-500 mr-2">' + escapeHtml(it.vendor) + '</span>' +
            '<span class="flex-1">' + escapeHtml(it.name) + '</span>' +
            '<span class="font-bold text-blue-600 ml-2">' + it.qty + escapeHtml(it.unit) + '</span>' +
            '</div>';
        }
      });
      html += '</div>';
      
      // 대기 상태일 때만 "반출 완료" 버튼 표시
      if (isPending) {
        const canSubmit = selectedCount > 0;
        const partialMsg = selectedCount < g.items.length 
          ? '<p class="text-xs text-blue-600 font-medium">💡 선택 안 한 ' + (g.items.length - selectedCount) + '개 품목은 대기 상태로 유지됩니다</p>' 
          : '';
        
        // 부분 수량 안내
        let hasPartialQty = false;
        g.items.forEach(it => {
          const sel = manageSelection[g.requestId][it.id];
          if (sel && sel.checked && sel.qty < it.qty) hasPartialQty = true;
        });
        const partialQtyMsg = hasPartialQty 
          ? '<p class="text-xs text-blue-600 font-medium">💡 일부 수량만 반출 시, 남은 수량은 대기 상태로 유지됩니다</p>' 
          : '';
        
        html += '<div class="mt-3 space-y-2">' +
          partialMsg + partialQtyMsg +
          '<div class="flex justify-end">' +
          '<button onclick="completeRequest(\'' + g.requestId + '\')" ' + (!canSubmit ? 'disabled' : '') + ' ' +
          'class="px-5 py-2.5 rounded-lg font-bold text-sm shadow-sm ' +
          (canSubmit ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed') + '">' +
          '✅ 반출 완료 처리 (' + selectedQty + '개)</button>' +
          '</div></div>';
      }
      
      html += '</div>';
    });
  }
  
  html += '</div></div>';
  document.getElementById('page-content').innerHTML = html;
}

// ============================================
// 선택 상태 관리 함수들
// ============================================
function toggleSelectAll(requestId, checked) {
  if (!manageSelection[requestId]) return;
  Object.keys(manageSelection[requestId]).forEach(itemId => {
    manageSelection[requestId][itemId].checked = checked;
  });
  renderManage();
}

function toggleItemCheck(requestId, itemId, checked) {
  if (!manageSelection[requestId] || !manageSelection[requestId][itemId]) return;
  manageSelection[requestId][itemId].checked = checked;
  renderManage();
}

function changeReleaseQty(requestId, itemId, delta) {
  if (!manageSelection[requestId] || !manageSelection[requestId][itemId]) return;
  // 원래 요청 수량 찾기
  const reqItem = requests.find(r => r.id === itemId);
  if (!reqItem) return;
  const newQty = manageSelection[requestId][itemId].qty + delta;
  if (newQty < 1) return;
  if (newQty > reqItem.qty) return; // 요청 수량 초과 불가
  manageSelection[requestId][itemId].qty = newQty;
  renderManage();
}

function setReleaseQty(requestId, itemId, value, maxQty) {
  if (!manageSelection[requestId] || !manageSelection[requestId][itemId]) return;
  let qty = parseInt(value) || 1;
  if (qty < 1) qty = 1;
  if (qty > maxQty) qty = maxQty;
  manageSelection[requestId][itemId].qty = qty;
  renderManage();
}

// ============================================
// 반출 완료 처리: 선택된 항목만 처리
// ============================================
function completeRequest(requestId) {
  const allItems = requests.filter(r => (r.requestId === requestId) && getReqStatus(r) === 'pending');
  if (allItems.length === 0) return;
  
  const sel = manageSelection[requestId] || {};
  
  // 선택된 항목만 추출
  const selectedItems = allItems.filter(it => sel[it.id] && sel[it.id].checked);
  if (selectedItems.length === 0) {
    showToast('선택된 품목이 없습니다', 'error');
    return;
  }
  
  const selectedTotalQty = selectedItems.reduce((s, it) => s + sel[it.id].qty, 0);
  
  // 재고 부족 체크
  const insufficient = selectedItems.filter(it => {
    const item = inventory.find(i => i.id === it.itemId);
    return item && sel[it.id].qty > item.stock;
  });
  
  // 부분 처리 안내
  const excludedCount = allItems.length - selectedItems.length;
  const partialQtyItems = selectedItems.filter(it => sel[it.id].qty < it.qty);
  
  let message = '[' + allItems[0].team + '] ' + allItems[0].requester + '님의 요청 처리\n\n';
  message += '✅ 반출할 품목 (' + selectedItems.length + '종 · ' + selectedTotalQty + '개):\n';
  message += selectedItems.map(function(it) { 
    const releaseQty = sel[it.id].qty;
    const partial = releaseQty < it.qty ? ' (요청 ' + it.qty + ' 중)' : '';
    return '  · ' + it.name + ' ' + releaseQty + it.unit + partial;
  }).join('\n');
  
  if (excludedCount > 0 || partialQtyItems.length > 0) {
    message += '\n\n⏳ 대기로 유지될 품목:';
    if (excludedCount > 0) message += '\n  · 선택 제외: ' + excludedCount + '종';
    if (partialQtyItems.length > 0) message += '\n  · 잔여 수량: ' + partialQtyItems.length + '종';
  }
  
  if (insufficient.length > 0) {
    message += '\n\n⚠️ 주의: ' + insufficient.length + '개 품목이 재고보다 많아 마이너스가 됩니다.';
  }
  
  askConfirm('반출 완료 처리', message, function() {
    const completeDate = new Date().toISOString();
    
    selectedItems.forEach(it => {
      const item = inventory.find(i => i.id === it.itemId);
      const releaseQty = sel[it.id].qty;
      
      if (item) {
        // 재고 차감
        item.stock -= releaseQty;
        // 이력 기록
        history.push({
          id: 'H' + Date.now() + '_' + it.itemId + '_' + Math.random().toString(36).slice(2, 6),
          type: 'out',
          date: completeDate,
          itemId: it.itemId,
          vendor: it.vendor,
          name: it.name,
          qty: releaseQty,
          unit: it.unit,
          team: it.team,
          requester: it.requester,
          requestId: requestId
        });
      }
      
      if (releaseQty === it.qty) {
        // 전량 반출: 요청 status 변경
        it.status = 'completed';
        it.completedDate = completeDate;
      } else {
        // 부분 반출: 원래 요청은 잔여 수량으로 유지, 완료된 만큼 새 completed 레코드 추가
        it.qty = it.qty - releaseQty; // 대기 수량 감소
        // 완료된 부분을 별도 레코드로 추가
        requests.push({
          id: it.id + '_done_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
          requestId: requestId,
          status: 'completed',
          date: it.date,
          completedDate: completeDate,
          itemId: it.itemId,
          vendor: it.vendor,
          name: it.name,
          qty: releaseQty,
          unit: it.unit,
          team: it.team,
          requester: it.requester
        });
      }
    });
    
    // 처리한 요청의 선택 상태 초기화
    delete manageSelection[requestId];
    
    saveAll();
    updateHeaderStats();
    showToast('반출 완료! ' + selectedItems.length + '종 ' + selectedTotalQty + '개 재고 차감', 'success');
    renderManage();
  }, '예, 완료 처리', 'teal');
}

// ============================================
// 요청 삭제 (대기/완료 모두 처리)
// ============================================
function deleteRequestGroup(requestId) {
  const items = requests.filter(r => r.requestId === requestId);
  if (items.length === 0) return;
  
  // 같은 requestId 안에 대기/완료 섞여 있을 수 있음 (부분 반출 결과)
  const pendingItems = items.filter(r => getReqStatus(r) === 'pending');
  const completedItems = items.filter(r => getReqStatus(r) === 'completed');
  
  // 현재 보고 있는 탭의 항목만 처리
  const isPending = manageStatusFilter === 'pending';
  const targetItems = isPending ? pendingItems : completedItems;
  if (targetItems.length === 0) return;
  
  const totalQty = targetItems.reduce((s, i) => s + i.qty, 0);
  
  let title, message, confirmText;
  if (isPending) {
    title = '대기 요청 삭제';
    message = '이 대기 요청을 삭제하시겠습니까?\n\n총 ' + targetItems.length + '종 ' + totalQty + '개\n\n💡 아직 재고가 차감되지 않아 복원이 필요 없습니다.';
    confirmText = '예, 삭제';
  } else {
    title = '완료 요청 취소';
    message = '이 반출 완료 내역을 취소하시겠습니까?\n\n취소된 수량은 재고로 복원됩니다.\n총 ' + targetItems.length + '종 ' + totalQty + '개';
    confirmText = '예, 취소';
  }
  
  askConfirm(title, message, function() {
    const targetIds = new Set(targetItems.map(it => it.id));
    
    if (!isPending) {
      // 완료 상태였으면 재고 복원
      targetItems.forEach(it => {
        const item = inventory.find(i => i.id === it.itemId);
        if (item) item.stock += it.qty;
      });
      // 이력에서 해당 requestId 전체 삭제 (구버전 호환)
      history = history.filter(h => h.requestId !== requestId);
    }
    
    // 요청에서 해당 항목들만 삭제
    requests = requests.filter(r => !targetIds.has(r.id));
    
    // 선택 상태 초기화
    delete manageSelection[requestId];
    
    saveAll();
    updateHeaderStats();
    showToast(isPending ? '대기 요청이 삭제되었습니다' : '완료 요청이 취소되고 재고가 복원되었습니다');
    renderManage();
  }, confirmText, 'red');
}
