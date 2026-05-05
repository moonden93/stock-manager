// ============================================
// 8-manage.js: 요청관리 화면
// ============================================
// 의존: 모든 이전 모듈
// 호출자: 99-main.js의 switchTab('manage')

let manageStatusFilter = 'pending'; // pending/completed
let manageFilter = 'all'; // all/today/week
let manageTeamFilter = '';

// 요청 항목의 분류를 찾는다.
// 1순위: itemId가 가리키는 inventory 항목의 category
// 2순위(fallback): 같은 vendor+name + category 있는 다른 inventory 항목
//   → 같은 제품이 inventory에 중복 등록되어 한쪽만 분류 채워진 경우 자동 보정
function resolveCategory_(it, item) {
  if (item && item.category) return item.category;
  if (!it.name) return '';
  const alt = inventory.find(i => i.vendor === it.vendor && i.name === it.name && i.category);
  return alt ? alt.category : '';
}

// 선택 상태: { groupId: { itemId(요청id): { checked: bool, qty: number } } }
// groupId = team|requester|YYYY-MM-DD|status — 같은 팀/담당자가 같은 날 여러 번 신청해도 한 그룹.
let manageSelection = {};

// 기존 데이터 호환: status가 없으면 'completed'로 간주
function getReqStatus(r) {
  return r.status || 'completed';
}

// 표시·조작 단위 그룹 식별자 생성 (팀+담당자+일자+상태)
function makeGroupId(r) {
  return r.team + '|' + r.requester + '|' + (r.date || '').slice(0, 10) + '|' + getReqStatus(r);
}

// groupId에 속하는 requests 항목들 반환
function findGroupItems(groupId) {
  return requests.filter(r => makeGroupId(r) === groupId);
}

// 선택 상태 초기화 (그룹별로 모두 체크 + 원래 수량)
function ensureSelection(groupId, items) {
  if (!manageSelection[groupId]) {
    manageSelection[groupId] = {};
  }
  items.forEach(it => {
    if (!manageSelection[groupId][it.id]) {
      manageSelection[groupId][it.id] = { checked: true, qty: it.qty };
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
  
  // 그룹핑: 같은 팀+담당자+날짜+상태를 한 카드로 묶음
  const grouped = {};
  filtered.forEach(r => {
    const key = makeGroupId(r);
    if (!grouped[key]) {
      grouped[key] = { groupId: key, date: r.date, team: r.team, requester: r.requester, status: getReqStatus(r), items: [] };
    }
    grouped[key].items.push(r);
    // 가장 빠른(요청 시작) 시각으로 유지
    if (new Date(r.date) < new Date(grouped[key].date)) grouped[key].date = r.date;
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
  html += '<div class="divide-y-2 divide-slate-100">';
  
  if (groups.length === 0) {
    const emptyMsg = manageStatusFilter === 'pending' 
      ? '대기 중인 반출 요청이 없습니다' 
      : '완료된 반출 내역이 없습니다';
    html += '<div class="py-12 text-center text-slate-400">' +
      '<p class="text-4xl mb-2">📭</p>' +
      '<p class="text-sm">' + emptyMsg + '</p></div>';
  } else {
    groups.forEach(g => {
      // 날짜만 표시 (시간 X) — 같은 날 여러 번 신청해도 한 카드라 시간 의미 없음
      const dt = new Date(g.date);
      const dateStr = (dt.getMonth() + 1) + '/' + dt.getDate();
      const totalQty = g.items.reduce((s, i) => s + i.qty, 0);
      const isPending = g.status === 'pending';
      const gid = escapeJs(g.groupId);

      // 대기 상태일 때만 선택 상태 초기화
      if (isPending) {
        ensureSelection(g.groupId, g.items);
      }

      // 선택된 항목 통계
      let selectedCount = 0, selectedQty = 0;
      if (isPending) {
        g.items.forEach(it => {
          const sel = manageSelection[g.groupId][it.id];
          if (sel && sel.checked) {
            selectedCount++;
            selectedQty += sel.qty;
          }
        });
      }
      const allSelected = isPending && selectedCount === g.items.length;

      // 완료 카드일 때 반출 담당자/일자 정보 (그룹 내 unique 값 모음 — 보통 1명·1일자)
      let releasedInfoHtml = '';
      if (!isPending) {
        const byList = [...new Set(g.items.map(it => it.releasedBy).filter(Boolean))];
        const dateList = [...new Set(g.items.map(it => (it.releasedDate || '').slice(0, 10)).filter(Boolean))];
        if (byList.length > 0 || dateList.length > 0) {
          const byHtml = byList.length > 0
            ? '<span class="font-bold text-emerald-800">' + byList.map(escapeHtml).join(', ') + (byList.length === 1 ? '님이 반출' : '님이 반출') + '</span>'
            : '<span class="text-slate-400 italic">담당자 미기록</span>';
          const dateHtml = dateList.length > 0
            ? '<span class="text-slate-600">· ' + dateList.map(d => {
                const dt = new Date(d + 'T00:00:00');
                return (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + dowKor(d);
              }).join(', ') + '</span>'
            : '';
          releasedInfoHtml = '<div class="text-xs px-3 py-2 mb-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 flex-wrap">' +
            '<span>📦</span>' + byHtml + dateHtml + '</div>';
        } else {
          // 옛 데이터(반출 담당자/일자 정보 없음) — 명시적으로 안내해서 누락 인지하게
          releasedInfoHtml = '<div class="text-xs px-3 py-2 mb-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 italic">📦 반출 담당자/일자 정보 없음 (옛 기록)</div>';
        }
      }

      // 메모 표시 (있으면)
      const groupMemo = (g.items.find(it => it.memo) || {}).memo || '';

      html += '<div class="px-4 py-3 hover:bg-slate-50 ' + (isPending ? 'bg-amber-50/30' : '') + '">' +
        '<div class="flex items-center justify-between mb-2">' +
        '<div class="flex items-center gap-2 flex-wrap">' +
        '<span class="text-xs text-slate-500">' + dateStr + '</span>' +
        '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">' + escapeHtml(g.team) + '</span>' +
        '<span class="text-xs text-slate-700">' + escapeHtml(g.requester) + '님 요청</span>' +
        (isPending ? '<span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">⏳ 대기</span>'
                   : '<span class="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">✅ 완료</span>') +
        '</div>' +
        '<div class="flex items-center gap-2">' +
        '<span class="text-sm font-bold text-slate-900">' + g.items.length + '종 · ' + totalQty + '개</span>' +
        '<button onclick="deleteRequestGroup(\'' + gid + '\')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="요청 삭제">🗑️</button>' +
        '</div></div>' +
        (groupMemo ? '<div class="mb-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-slate-800">📝 <strong>요청자 메모:</strong> ' + escapeHtml(groupMemo) + '</div>' : '') +
        releasedInfoHtml;

      // 대기 상태: 전체선택 바 추가
      if (isPending) {
        html += '<div class="flex items-center justify-between px-2 py-2 mb-2 bg-white rounded-lg border border-slate-200">' +
          '<label class="flex items-center gap-2 cursor-pointer">' +
          '<input type="checkbox" ' + (allSelected ? 'checked' : '') + ' ' +
          'onchange="toggleSelectAll(\'' + gid + '\', this.checked)" ' +
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
          const sel = manageSelection[g.groupId][it.id];
          const isChecked = sel.checked;
          const releaseQty = sel.qty;
          const isShort = isChecked && releaseQty > stock;
          const catBadge = categoryBadgeHtml_(resolveCategory_(it, item));

          html += '<div class="flex items-center gap-2 py-2 px-2 ' + (isChecked ? 'bg-white' : 'bg-slate-100 opacity-60') + ' rounded-lg border border-slate-100">' +
            '<input type="checkbox" ' + (isChecked ? 'checked' : '') + ' ' +
            'onchange="toggleItemCheck(\'' + gid + '\', \'' + it.id + '\', this.checked)" ' +
            'class="w-5 h-5 accent-emerald-600 cursor-pointer flex-shrink-0" />' +
            '<div class="flex-1 min-w-0">' +
            '<p class="text-xs text-slate-500">' + catBadge + escapeHtml(it.vendor || (it.isCustom ? '업체 미지정' : '')) + '</p>' +
            '<p class="text-sm text-slate-800 truncate">' +
            (it.isCustom ? '<span class="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-[10px] font-bold mr-1 align-middle">🆕 직접 요청</span>' : '') +
            escapeHtml(it.name) + '</p>' +
            '<p class="text-xs text-slate-500">요청 ' + it.qty +
            (it.isCustom
              ? ' · <button onclick="openCustomItemDetail(\'' + escapeJs(it.id) + '\')" class="text-teal-600 underline hover:text-teal-700">상세보기</button>'
              : ' · 재고 ' + stock + (isShort ? ' <span class="text-amber-700 font-bold">⚠️ 재고 부족</span>' : '')) +
            '</p>' +
            '</div>';

          if (isChecked) {
            // 수량 조절 버튼
            html += '<div class="flex items-center gap-1 flex-shrink-0">' +
              '<button onclick="changeReleaseQty(\'' + gid + '\', \'' + it.id + '\', -1)" ' +
              'class="w-8 h-8 bg-slate-200 hover:bg-slate-300 rounded text-base font-bold">−</button>' +
              '<input type="number" value="' + releaseQty + '" min="1" max="' + it.qty + '" ' +
              'onchange="setReleaseQty(\'' + gid + '\', \'' + it.id + '\', this.value, ' + it.qty + ')" ' +
              'onfocus="this.select()" ' +
              'class="w-12 h-8 text-center font-bold bg-white border-2 ' + (isShort ? 'border-amber-400' : 'border-slate-200') + ' rounded text-sm" />' +
              '<button onclick="changeReleaseQty(\'' + gid + '\', \'' + it.id + '\', 1)" ' +
              'class="w-8 h-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-base font-bold">+</button>' +
              '</div>';
          } else {
            html += '<span class="text-xs text-slate-400 px-2">제외</span>';
          }

          html += '</div>';
        } else {
          // 완료 상태: 기존 표시 방식 (직접 요청은 🆕 배지 + 상세보기)
          const catBadge = categoryBadgeHtml_(resolveCategory_(it, item));
          html += '<div class="flex items-center text-xs text-slate-600 py-1">' +
            '<span class="text-slate-400 mr-2">·</span>' +
            '<span class="text-slate-500 mr-2">' + catBadge + escapeHtml(it.vendor || (it.isCustom ? '업체 미지정' : '')) + '</span>' +
            '<span class="flex-1 truncate">' +
            (it.isCustom ? '<span class="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-[10px] font-bold mr-1 align-middle">🆕</span>' : '') +
            escapeHtml(it.name) + '</span>' +
            (it.isCustom ? '<button onclick="openCustomItemDetail(\'' + escapeJs(it.id) + '\')" class="text-teal-600 underline hover:text-teal-700 mr-2 whitespace-nowrap">상세보기</button>' : '') +
            '<span class="font-bold text-blue-600 ml-2">' + it.qty + '</span>' +
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
          const sel = manageSelection[g.groupId][it.id];
          if (sel && sel.checked && sel.qty < it.qty) hasPartialQty = true;
        });
        const partialQtyMsg = hasPartialQty
          ? '<p class="text-xs text-blue-600 font-medium">💡 일부 수량만 반출 시, 남은 수량은 대기 상태로 유지됩니다</p>'
          : '';

        html += '<div class="mt-3 space-y-2">' +
          partialMsg + partialQtyMsg +
          '<div class="flex justify-end">' +
          '<button onclick="completeRequest(\'' + gid + '\')" ' + (!canSubmit ? 'disabled' : '') + ' ' +
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
function toggleSelectAll(groupId, checked) {
  if (!manageSelection[groupId]) return;
  Object.keys(manageSelection[groupId]).forEach(itemId => {
    manageSelection[groupId][itemId].checked = checked;
  });
  renderManage();
}

function toggleItemCheck(groupId, itemId, checked) {
  if (!manageSelection[groupId] || !manageSelection[groupId][itemId]) return;
  manageSelection[groupId][itemId].checked = checked;
  renderManage();
}

function changeReleaseQty(groupId, itemId, delta) {
  if (!manageSelection[groupId] || !manageSelection[groupId][itemId]) return;
  // 원래 요청 수량 찾기
  const reqItem = requests.find(r => r.id === itemId);
  if (!reqItem) return;
  const newQty = manageSelection[groupId][itemId].qty + delta;
  if (newQty < 1) return;
  if (newQty > reqItem.qty) return; // 요청 수량 초과 불가
  manageSelection[groupId][itemId].qty = newQty;
  renderManage();
}

function setReleaseQty(groupId, itemId, value, maxQty) {
  if (!manageSelection[groupId] || !manageSelection[groupId][itemId]) return;
  let qty = parseInt(value) || 1;
  if (qty < 1) qty = 1;
  if (qty > maxQty) qty = maxQty;
  manageSelection[groupId][itemId].qty = qty;
  renderManage();
}

// ============================================
// 반출 완료 처리: 선택된 항목만 처리
// ============================================
function completeRequest(groupId) {
  const allItems = requests.filter(r => makeGroupId(r) === groupId && getReqStatus(r) === 'pending');
  if (allItems.length === 0) return;

  const sel = manageSelection[groupId] || {};

  // 선택된 항목만 추출
  const selectedItems = allItems.filter(it => sel[it.id] && sel[it.id].checked);
  if (selectedItems.length === 0) {
    showAlert('선택된 품목이 없습니다', '완료 처리할 품목을 먼저 선택해주세요.\n\n각 품목 왼쪽의 체크박스를 누르거나\n맨 위 [전체 선택]을 누르면\n모든 품목이 선택됩니다.');
    return;
  }
  
  const selectedTotalQty = selectedItems.reduce((s, it) => s + sel[it.id].qty, 0);
  
  // 재고 부족 체크
  const insufficient = selectedItems.filter(it => {
    const item = inventory.find(i => i.id === it.itemId);
    return item && sel[it.id].qty > item.stock;
  });
  
  // 재고 부족 시 처리 차단 (경고만 뜨고 종료)
  if (insufficient.length > 0) {
    let warnMsg = '🚫 다음 품목이 재고보다 많이 요청되었습니다:\n\n';
    insufficient.forEach(it => {
      const item = inventory.find(i => i.id === it.itemId);
      warnMsg += '· ' + it.name + '\n   요청 ' + sel[it.id].qty + ' / 재고 ' + item.stock + '\n';
    });
    warnMsg += '\n수량을 재고 이내로 조정하거나, 부족한 품목은 체크 해제 후 다시 시도해주세요.';
    askConfirm('⚠️ 처리할 수 없음', warnMsg, function() {}, '확인', 'red');
    return;
  }
  
  // 부분 처리 안내
  
  const excludedCount = allItems.length - selectedItems.length;
  const partialQtyItems = selectedItems.filter(it => sel[it.id].qty < it.qty);
  
  let message = '[' + allItems[0].team + '] ' + allItems[0].requester + '님의 요청 처리\n\n';
  message += '✅ 반출할 품목 (' + selectedItems.length + '종 · ' + selectedTotalQty + '개):\n';
  message += selectedItems.map(function(it) { 
    const releaseQty = sel[it.id].qty;
    const partial = releaseQty < it.qty ? ' (요청 ' + it.qty + ' 중)' : '';
    return '  · ' + it.name + ' ' + releaseQty + partial;
  }).join('\n');
  
  if (excludedCount > 0 || partialQtyItems.length > 0) {
    message += '\n\n⏳ 대기로 유지될 품목:';
    if (excludedCount > 0) message += '\n  · 선택 제외: ' + excludedCount + '종';
    if (partialQtyItems.length > 0) message += '\n  · 잔여 수량: ' + partialQtyItems.length + '종';
  }
  
  if (insufficient.length > 0) {
    message += '\n\n⚠️ 주의: ' + insufficient.length + '개 품목이 재고보다 많아 마이너스가 됩니다.';
  }
  
  // 기존 askConfirm 대신 [반출 담당자/일자] 입력 받는 커스텀 모달 노출.
  // 모달 확인 시 submitCompleteRequest -> executeCompleteRequest 흐름으로 실제 처리.
  openCompleteRequestModal(groupId, message);
}

// ============================================
// 완료 처리 모달 (반출 담당자 / 반출 일자 입력)
// ============================================

// YYYY-MM-DD 문자열 -> 한글 요일 (로컬 기준)
function dowKor(yyyymmdd) {
  const parts = yyyymmdd.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '';
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  return days[new Date(parts[0], parts[1] - 1, parts[2]).getDay()];
}

// 날짜 input 변경 시 라벨 옆 요일 갱신
function updateReleaseDateDow() {
  const input = document.getElementById('release-date');
  const span = document.getElementById('release-date-dow');
  if (!input || !span) return;
  span.textContent = dowKor(input.value);
}

function openCompleteRequestModal(groupId, summary) {
  // 오늘 날짜 (로컬 기준)
  const now = new Date();
  const todayStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-teal-50 border-b border-teal-200">' +
    '<h3 class="text-base font-bold text-slate-900">반출 완료 처리</h3></div>' +
    '<div class="px-5 py-5 overflow-y-auto flex-1 space-y-4">' +
    // 요약 텍스트 (기존 askConfirm 메시지와 동일)
    '<p class="text-sm text-slate-700 whitespace-pre-line leading-relaxed">' + escapeHtml(summary) + '</p>' +
    // 반출 담당자
    '<div>' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">반출 담당자 <span class="text-red-500">*</span></label>' +
    '<div class="grid grid-cols-2 gap-2">' +
    '<button id="releaser-btn-이충현" onclick="selectReleaser(\'이충현\')" class="py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-700 hover:border-teal-400 transition">이충현</button>' +
    '<button id="releaser-btn-주경심" onclick="selectReleaser(\'주경심\')" class="py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-700 hover:border-teal-400 transition">주경심</button>' +
    '</div>' +
    '<p class="text-xs text-slate-500 mt-3 mb-1">또는 다른 사람이 반출한 경우 직접 입력:</p>' +
    '<input type="text" id="releaser-custom" oninput="onReleaserCustomInput(this.value)" placeholder="이름 입력" class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />' +
    '</div>' +
    // 반출 일자 (input 우측에 요일 표시)
    '<div>' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">반출 일자</label>' +
    '<div class="flex items-center gap-2">' +
    '<input type="date" id="release-date" value="' + todayStr + '" oninput="updateReleaseDateDow()" class="flex-1 px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />' +
    '<span id="release-date-dow" class="text-base font-bold text-slate-700 px-1">' + dowKor(todayStr) + '</span>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button id="complete-confirm-btn" onclick="submitCompleteRequest(\'' + escapeJs(groupId) + '\')" disabled ' +
    'class="flex-1 py-3 bg-slate-200 text-slate-400 cursor-not-allowed rounded-lg font-bold">반출 담당자 선택 필요</button>' +
    '</div></div></div>';

  document.getElementById('modal-container').innerHTML = html;
  window._pendingReleaser = null;
}

// 확인 버튼 활성/비활성 갱신 (담당자가 정해졌으면 활성)
function updateCompleteConfirmBtn() {
  const confirmBtn = document.getElementById('complete-confirm-btn');
  if (!confirmBtn) return;
  if (window._pendingReleaser) {
    confirmBtn.disabled = false;
    confirmBtn.className = 'flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold';
    confirmBtn.textContent = '예, 완료 처리';
  } else {
    confirmBtn.disabled = true;
    confirmBtn.className = 'flex-1 py-3 bg-slate-200 text-slate-400 cursor-not-allowed rounded-lg font-bold';
    confirmBtn.textContent = '반출 담당자 선택 필요';
  }
}

// 반출 담당자 버튼 클릭 핸들러
function selectReleaser(name) {
  window._pendingReleaser = name;
  // 두 버튼 시각 토글
  ['이충현', '주경심'].forEach(n => {
    const b = document.getElementById('releaser-btn-' + n);
    if (!b) return;
    b.className = (n === name)
      ? 'py-3 bg-teal-600 border-2 border-teal-600 rounded-xl font-bold text-white transition'
      : 'py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-700 hover:border-teal-400 transition';
  });
  // 직접 입력 칸은 비움 (버튼 선택과 입력 칸은 상호 배타)
  const customInput = document.getElementById('releaser-custom');
  if (customInput) customInput.value = '';
  updateCompleteConfirmBtn();
}

// 직접 입력 칸 입력 핸들러
// - 입력이 비어있지 않으면 버튼 선택을 해제하고 입력값을 담당자로 사용
// - 입력이 비면 _pendingReleaser 도 비워서 확인 버튼이 다시 비활성화됨
function onReleaserCustomInput(value) {
  const trimmed = (value || '').trim();
  if (trimmed) {
    window._pendingReleaser = trimmed;
    // 버튼 선택 시각 해제
    ['이충현', '주경심'].forEach(n => {
      const b = document.getElementById('releaser-btn-' + n);
      if (b) b.className = 'py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-700 hover:border-teal-400 transition';
    });
  } else {
    window._pendingReleaser = null;
  }
  updateCompleteConfirmBtn();
}

// 모달 확인 버튼 핸들러: 입력값 수집 -> 실제 처리 호출
function submitCompleteRequest(groupId) {
  const releasedBy = window._pendingReleaser;
  if (!releasedBy) {
    showAlert('반출 담당자를 선택해주세요', '실제로 반출한 사람을 입력해야 처리됩니다.\n\n[이충현] 또는 [주경심] 버튼을 누르거나,\n다른 사람이면 아래 입력 칸에\n이름을 직접 입력하세요.');
    return;
  }
  const dateInput = document.getElementById('release-date');
  const dateStr = dateInput && dateInput.value;
  if (!dateStr) {
    showAlert('반출 일자를 입력해주세요', '반출이 이루어진 날짜를 골라주세요.\n\n날짜 입력 칸을 눌러\n달력에서 날짜를 선택할 수 있습니다.');
    return;
  }
  // YYYY-MM-DD -> ISO (UTC midnight)
  const releasedDate = new Date(dateStr + 'T00:00:00.000Z').toISOString();
  closeModal();
  window._pendingReleaser = null;
  executeCompleteRequest(groupId, releasedBy, releasedDate);
}

// 실제 데이터 변경: 재고 차감 + history/requests 기록
// groupId 안에 여러 원본 requestId가 섞일 수 있어 history/requests 레코드는
// 각 항목의 원래 it.requestId를 그대로 보존한다.
function executeCompleteRequest(groupId, releasedBy, releasedDate) {
  const allItems = requests.filter(r => makeGroupId(r) === groupId && getReqStatus(r) === 'pending');
  if (allItems.length === 0) return;

  const sel = manageSelection[groupId] || {};
  const selectedItems = allItems.filter(it => sel[it.id] && sel[it.id].checked);
  if (selectedItems.length === 0) { showAlert('선택된 품목이 없습니다', '완료 처리할 품목을 먼저 선택해주세요.'); return; }

  const selectedTotalQty = selectedItems.reduce((s, it) => s + sel[it.id].qty, 0);
  const completeDate = new Date().toISOString();

  selectedItems.forEach(it => {
    const item = inventory.find(i => i.id === it.itemId);
    const releaseQty = sel[it.id].qty;

    // 재고 차감 (인벤토리에 있는 정규 품목만; 직접 요청은 인벤토리 외부)
    if (item) {
      item.stock -= releaseQty;
    }

    // 이력 기록은 항상 (직접 요청 포함). isCustom일 때 설명/사진 보존.
    const histRec = {
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
      requestId: it.requestId,
      releasedBy: releasedBy,
      releasedDate: releasedDate
    };
    if (it.isCustom) {
      histRec.isCustom = true;
      histRec.customDescription = it.customDescription || '';
      histRec.customImages = it.customImages || [];
    }
    history.push(histRec);

    // Phase 1: 반출 처리 audit log
    if (typeof logEvent === 'function') {
      logEvent('request', 'process', {
        summary: '[' + it.team + '] ' + (it.requester || it.member) + ' → ' + releasedBy + '님 처리: ' + it.name + ' x ' + releaseQty,
        requestId: it.id,
        team: it.team,
        requester: it.requester || it.member,
        releasedBy: releasedBy,
        item: it.name,
        qty: releaseQty,
        partial: releaseQty !== it.qty,
        originalQty: it.qty
      });
    }

    if (releaseQty === it.qty) {
      // 전량 반출: 요청 status 변경
      it.status = 'completed';
      it.completedDate = completeDate;
      it.releasedBy = releasedBy;
      it.releasedDate = releasedDate;
    } else {
      // 부분 반출: 원래 요청은 잔여 수량으로 유지, 완료된 부분을 별도 레코드로 추가
      it.qty = it.qty - releaseQty;
      const newReq = {
        id: it.id + '_done_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
        requestId: it.requestId,
        status: 'completed',
        date: it.date,
        completedDate: completeDate,
        itemId: it.itemId,
        vendor: it.vendor,
        name: it.name,
        qty: releaseQty,
        unit: it.unit,
        team: it.team,
        requester: it.requester,
        releasedBy: releasedBy,
        releasedDate: releasedDate
      };
      if (it.isCustom) {
        newReq.isCustom = true;
        newReq.customDescription = it.customDescription || '';
        newReq.customImages = it.customImages || [];
      }
      requests.push(newReq);
    }
  });

  // 처리한 그룹의 선택 상태 초기화
  delete manageSelection[groupId];

  saveAll();
  updateHeaderStats();
  showToast('반출 완료! ' + selectedItems.length + '종 ' + selectedTotalQty + '개 재고 차감', 'success');
  renderManage();
}

// ============================================
// 요청 삭제 (대기/완료 모두 처리)
// ============================================
function deleteRequestGroup(groupId) {
  // 그룹에 속한 항목들 (현재 탭의 status로 묶인 것만)
  const targetItems = requests.filter(r => makeGroupId(r) === groupId);
  if (targetItems.length === 0) return;

  const isPending = manageStatusFilter === 'pending';
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
    // 그룹에 속한 원본 requestId들 (history 정리용)
    const groupRequestIds = new Set(targetItems.map(it => it.requestId).filter(Boolean));

    if (!isPending) {
      // 완료 상태였으면 재고 복원
      targetItems.forEach(it => {
        const item = inventory.find(i => i.id === it.itemId);
        if (item) item.stock += it.qty;
      });
      // 이력에서 해당 requestId들과 매칭되는 항목 삭제
      // (history는 항목별 requestId로 보존되므로 그룹의 모든 requestId를 제거)
      history = history.filter(h => !groupRequestIds.has(h.requestId));
    }

    // Phase 1: 삭제 audit log (삭제 전에 데이터 보존)
    if (typeof logEvent === 'function') {
      const summary = (isPending ? '대기 삭제' : '완료 취소') +
                      ': [' + targetItems[0].team + '] ' + (targetItems[0].requester || targetItems[0].member) +
                      ' ' + targetItems.length + '종 ' + totalQty + '개';
      logEvent('request', isPending ? 'delete_pending' : 'cancel_completed', {
        summary: summary,
        team: targetItems[0].team,
        requester: targetItems[0].requester || targetItems[0].member,
        items: targetItems.map(it => ({
          id: it.id, requestId: it.requestId, item: it.name, qty: it.qty,
          vendor: it.vendor, unit: it.unit, status: it.status, date: it.date
        }))
      });
    }

    // 요청에서 해당 항목들만 삭제
    requests = requests.filter(r => !targetIds.has(r.id));

    // 선택 상태 초기화
    delete manageSelection[groupId];

    saveAll();
    updateHeaderStats();
    showToast(isPending ? '대기 요청이 삭제되었습니다' : '완료 요청이 취소되고 재고가 복원되었습니다');
    renderManage();
  }, confirmText, 'red');
}

// ============================================
// 직접 요청(isCustom) 상세 보기 모달
// ============================================
function openCustomItemDetail(reqItemId) {
  const item = requests.find(r => r.id === reqItemId);
  if (!item || !item.isCustom) return;

  const desc = item.customDescription || '';
  const images = item.customImages || [];

  let imagesHtml;
  if (images.length > 0) {
    imagesHtml = '<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">';
    images.forEach((img, idx) => {
      imagesHtml += '<button onclick="previewCustomImage(\'' + escapeJs(reqItemId) + '\', ' + idx + ')" ' +
        'class="aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200 hover:border-teal-400 transition">' +
        '<img src="' + img.data + '" alt="' + escapeHtml(img.name) + '" class="w-full h-full object-cover" />' +
        '</button>';
    });
    imagesHtml += '</div>';
  } else {
    imagesHtml = '<p class="text-sm text-slate-400 italic">첨부된 사진 없음</p>';
  }

  const dt = new Date(item.date);
  const dateStr = dt.getFullYear() + '-' +
    String(dt.getMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getDate()).padStart(2, '0');

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-teal-50 border-b border-teal-200">' +
    '<h3 class="text-base font-bold text-slate-900">🆕 ' + escapeHtml(item.name) + '</h3>' +
    '<p class="text-xs text-slate-500 mt-1">' +
    escapeHtml(item.vendor || '업체 미지정') + ' · ' + escapeHtml(item.team) + ' · ' + escapeHtml(item.requester) + '님 · ' +
    dateStr + ' · 요청 ' + item.qty + (item.unit ? ' ' + escapeHtml(item.unit) : '') +
    '</p></div>' +
    '<div class="px-5 py-5 overflow-y-auto space-y-4">' +
    '<div><h4 class="text-sm font-bold text-slate-700 mb-2">상세 설명</h4>' +
    (desc
      ? '<p class="text-sm text-slate-700 whitespace-pre-line leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">' + escapeHtml(desc) + '</p>'
      : '<p class="text-sm text-slate-400 italic">설명 없음</p>') +
    '</div>' +
    '<div><h4 class="text-sm font-bold text-slate-700 mb-2">참고 사진 (' + images.length + '장)</h4>' +
    imagesHtml + '</div>' +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t">' +
    '<button onclick="closeModal()" class="w-full py-3 bg-slate-200 hover:bg-slate-300 rounded-lg font-bold text-slate-700">닫기</button>' +
    '</div></div></div>';

  document.getElementById('modal-container').innerHTML = html;
}

// 직접 요청 사진 풀스크린 프리뷰 (닫으면 모달 전체가 닫힘 - 단일 컨테이너 구조)
function previewCustomImage(reqItemId, imageIdx) {
  const item = requests.find(r => r.id === reqItemId);
  if (!item || !item.customImages || !item.customImages[imageIdx]) return;
  const img = item.customImages[imageIdx];
  const html = '<div class="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onclick="closeModal()">' +
    '<img src="' + img.data + '" alt="' + escapeHtml(img.name) + '" ' +
    'class="max-w-full max-h-full object-contain" onclick="event.stopPropagation()" />' +
    '<button onclick="closeModal()" class="fixed top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/30 text-white rounded-full text-xl flex items-center justify-center">✕</button>' +
    '</div>';
  document.getElementById('modal-container').innerHTML = html;
}
