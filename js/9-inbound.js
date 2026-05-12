// ============================================
// 9-inbound.js: 입고 화면
// ============================================
// 의존: 4-utils.js (escapeHtml, escapeJs)
//       모든 이전 모듈
// 호출자: 99-main.js의 switchTab('inbound')

let inboundSearchTerm = '';
let inboundSelectedVendor = '';
let inboundSelectedCategory = '';  // 분류 필터 (구강위생용품/치과재료)

function getInboundFilteredItems() {
  const filtered = inventory.filter(i => {
    if (inboundSelectedVendor && i.vendor !== inboundSelectedVendor) return false;
    if (inboundSelectedCategory && (i.category || '') !== inboundSelectedCategory) return false;
    if (inboundSearchTerm) {
      if (!matchesSearch(i.name, inboundSearchTerm) && !matchesSearch(i.vendor, inboundSearchTerm)) return false;
    }
    return true;
  });
  // 이름 자연 정렬 (H File 21mm #08 → #10 → #15 → ... → #80 순)
  filtered.sort((a, b) => {
    const va = (a.vendor || ''), vb = (b.vendor || '');
    if (va !== vb) return va.localeCompare(vb, 'ko');
    return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
  });
  return filtered;
}

function _inboundItemRowHtml(item) {
  // 이미 장바구니에 담긴 항목인지
  const inCart = orderCart.find(c => c.itemId === item.id);
  const cartQty = inCart ? inCart.qty : 0;
  const btnLabel = inCart ? '✓ 담김 (' + cartQty + ')' : '+ 담기';
  const btnCls = inCart ? 'bg-slate-400 hover:bg-slate-500' : 'bg-emerald-600 hover:bg-emerald-700';
  return '<div class="px-4 py-3 hover:bg-slate-50"><div class="flex items-center gap-3">' +
    '<div class="flex-1 min-w-0">' +
    '<p class="text-xs text-slate-500">' + categoryBadgeHtml_(item.category) + escapeHtml(item.vendor) + '</p>' +
    '<p class="text-sm font-medium text-slate-900 truncate">' + escapeHtml(item.name) + '</p>' +
    '<p class="text-xs text-slate-500 mt-0.5">현재 재고: <strong>' + item.stock + '</strong>' +
    (item.price ? ' · ' + item.price.toLocaleString() + '원' : '') + '</p></div>' +
    '<button onclick="openOrderItemDialog(\'' + item.id + '\')" class="px-4 h-10 ' + btnCls + ' text-white rounded-lg text-base font-bold whitespace-nowrap">' + btnLabel + '</button>' +
    '</div></div>';
}

// 검색 결과 목록만 부분 갱신 (검색 input destroy 안 함 → IME 안전)
function renderInboundItems() {
  const filtered = getInboundFilteredItems();
  const listEl = document.getElementById('inbound-items-list');
  if (!listEl) return;
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="py-12 text-center text-slate-400">검색 결과 없음</div>';
  } else {
    let html = '';
    filtered.forEach(item => { html += _inboundItemRowHtml(item); });
    listEl.innerHTML = html;
  }
}

function renderInbound() {
  const vendors = [...new Set(inventory.map(i => i.vendor))].sort();
  const categories = [...new Set(inventory.map(i => i.category || '').filter(Boolean))].sort();
  const filtered = getInboundFilteredItems();

  // ============================================
  // 📋 입고 내역 HTML 빌드 (먼저 만들어 둠 — 품목 위에 배치)
  // ============================================
  const allIn = (history || []).filter(h => h.type === 'in');

  // 년도/월 필터 (기본 — 현재 년도 + 현재 월)
  if (typeof window._inboundFilterYear === 'undefined') {
    window._inboundFilterYear = String(new Date().getFullYear());
  }
  if (typeof window._inboundFilterMonth === 'undefined') {
    window._inboundFilterMonth = String(new Date().getMonth() + 1);
  }
  const filterYear = window._inboundFilterYear;
  const filterMonth = window._inboundFilterMonth;

  // 사용 가능한 년도 목록 (history 기반)
  const availableYears = [...new Set(allIn.map(h => {
    const d = new Date(h.date);
    return isNaN(d.getTime()) ? null : d.getFullYear();
  }).filter(Boolean))].sort((a, b) => b - a);  // 내림차순

  const inHistory = allIn.filter(h => {
    if (!filterYear && !filterMonth) return true;
    const d = new Date(h.date);
    if (isNaN(d.getTime())) return false;
    if (filterYear && d.getFullYear() !== parseInt(filterYear, 10)) return false;
    if (filterMonth && (d.getMonth() + 1) !== parseInt(filterMonth, 10)) return false;
    return true;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  // 전체 섹션 collapsible — 기본 접힘 (너무 길어서)
  if (typeof window._inboundHistoryExpanded === 'undefined') {
    window._inboundHistoryExpanded = false;
  }
  const sectionExpanded = window._inboundHistoryExpanded;

  // 가격 lookup
  const priceLookup = function(h) {
    if (h.price > 0) return h.price;
    const item = inventory.find(i => i.id === h.itemId);
    return (item && item.price) || 0;
  };
  // 합계 (필터된 + cancelled 제외)
  const filteredTotalCost = inHistory.filter(h => !h.cancelled)
    .reduce((s, h) => s + (h.qty || 0) * priceLookup(h), 0);
  const filteredTotalCostStr = filteredTotalCost > 0 ? ' · ' + filteredTotalCost.toLocaleString() + '원' : '';

  // 헤더 라벨
  const filterLabel = (filterYear || filterMonth)
    ? ' (' + (filterYear || '전체') + (filterMonth ? ' ' + parseInt(filterMonth, 10) + '월' : '') + ')'
    : '';

  let inHistHtml = '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-clip">' +
    '<button onclick="toggleInboundHistorySection()" ' +
    'class="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 border-b border-slate-200 flex items-center gap-2 text-left">' +
    '<span class="text-slate-500 text-sm">' + (sectionExpanded ? '▼' : '▶') + '</span>' +
    '<h3 class="text-base font-bold text-slate-900">📋 입고 내역</h3>' +
    '<span class="ml-auto text-xs text-slate-500">총 ' + inHistory.length + '건' + filteredTotalCostStr + filterLabel + '</span>' +
    '</button>';

  // 펼친 상태에서 년도/월 필터 표시
  if (sectionExpanded) {
    inHistHtml += '<div class="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 flex-wrap">' +
      '<span class="text-xs text-slate-600">년도:</span>' +
      '<select onchange="setInboundFilterYear(this.value)" class="text-xs px-2 py-1 border border-slate-300 rounded-lg bg-white">' +
      '<option value=""' + (!filterYear ? ' selected' : '') + '>전체</option>';
    availableYears.forEach(y => {
      inHistHtml += '<option value="' + y + '"' + (filterYear === String(y) ? ' selected' : '') + '>' + y + '</option>';
    });
    inHistHtml += '</select>' +
      '<span class="text-xs text-slate-600 ml-2">월:</span>' +
      '<select onchange="setInboundFilterMonth(this.value)" class="text-xs px-2 py-1 border border-slate-300 rounded-lg bg-white">' +
      '<option value=""' + (!filterMonth ? ' selected' : '') + '>전체</option>';
    for (let m = 1; m <= 12; m++) {
      inHistHtml += '<option value="' + m + '"' + (filterMonth === String(m) ? ' selected' : '') + '>' + m + '월</option>';
    }
    inHistHtml += '</select>';
    inHistHtml += '</div>';
  }

  if (sectionExpanded && inHistory.length === 0) {
    inHistHtml += '<div class="py-12 text-center text-slate-400">' +
      '<p class="text-4xl mb-2">📥</p>' +
      '<p class="text-sm">입고 내역이 없습니다</p></div>';
  } else if (sectionExpanded) {
    const currentWeek = (typeof getWeekKey === 'function') ? getWeekKey(new Date()) : '';
    window._inboundExpandedWeeks = window._inboundExpandedWeeks || {};

    const weekItems = {};
    inHistory.forEach(h => {
      const wk = (typeof getWeekKey === 'function') ? getWeekKey(h.date) : (h.date || '').slice(0, 7);
      if (!weekItems[wk]) weekItems[wk] = [];
      weekItems[wk].push(h);
    });
    const orderedWeeks = Object.keys(weekItems);

    orderedWeeks.forEach((wk, wi) => {
      const entries = weekItems[wk];
      const wkLabel = (typeof formatWeekLabel === 'function') ? formatWeekLabel(wk) : wk;
      const totalQty = entries.reduce((s, e) => s + (e.qty || 0), 0);
      const weekCost = entries.filter(e => !e.cancelled)
        .reduce((s, e) => s + (e.qty || 0) * priceLookup(e), 0);
      const weekCostStr = weekCost > 0 ? ' · ' + weekCost.toLocaleString() + '원' : '';
      const isAutoOpen = (wk === currentWeek) || (currentWeek === '' && wi === 0);
      const expanded = (window._inboundExpandedWeeks[wk] === undefined) ? isAutoOpen : window._inboundExpandedWeeks[wk];

      inHistHtml += '<div class="' + (wi > 0 ? 'border-t-2 border-slate-200' : '') + '">' +
        '<button onclick="toggleInboundWeek(\'' + escapeJs(wk) + '\')" ' +
        'class="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center gap-2 text-left">' +
        '<span class="text-slate-500 text-xs">' + (expanded ? '▼' : '▶') + '</span>' +
        '<span class="font-bold text-slate-800 text-sm">📅 ' + escapeHtml(wkLabel) + '</span>' +
        '<span class="ml-auto text-xs text-slate-600">' + entries.length + '건 · ' + totalQty + '개' + weekCostStr + '</span>' +
        '</button>' +
        '<div class="' + (expanded ? '' : 'hidden') + ' divide-y divide-slate-100">';

      entries.forEach(e => {
        const dt = new Date(e.date);
        const dateStr = (dt.getMonth() + 1) + '/' + dt.getDate();
        const isReverted = !!e.cancelled;
        const rowCls = isReverted ? 'px-4 py-3 bg-slate-50 opacity-70' : 'px-4 py-3 hover:bg-slate-50';
        const entryPrice = priceLookup(e);
        const entryQty = e.qty || 0;
        const entryCost = entryQty * entryPrice;
        const priceStr = entryPrice > 0 ? entryPrice.toLocaleString() + '원' : '';
        const costStr = entryCost > 0 ? entryCost.toLocaleString() + '원' : '';
        const lineThru = isReverted ? 'text-slate-400 line-through' : '';
        inHistHtml += '<div class="' + rowCls + '">' +
          '<div class="flex items-center gap-3">' +
          '<div class="text-xs text-slate-500 w-12 flex-shrink-0">' + dateStr + '</div>' +
          '<div class="flex-1 min-w-0">' +
          '<p class="text-xs text-slate-500">' + escapeHtml(e.vendor || '') + (isReverted ? ' · <span class="text-slate-400 font-bold">❌ 되돌림</span>' : '') + '</p>' +
          '<p class="text-sm font-medium text-slate-900 truncate ' + (isReverted ? 'line-through text-slate-500' : '') + '">' + escapeHtml(e.name || '') + '</p>' +
          (isReverted && e.cancelReason ? '<p class="text-[11px] text-slate-500 mt-0.5">📝 ' + escapeHtml(e.cancelReason) + '</p>' : '') +
          '</div>' +
          '<div class="text-right flex-shrink-0 flex items-center gap-2">' +
          '<div class="flex flex-col items-end leading-tight">' +
          // 1줄: +수량 × 단가
          '<span class="text-base font-bold ' + (isReverted ? 'text-slate-400 line-through' : 'text-emerald-700') + '">+' + entryQty +
          (priceStr ? ' <span class="text-[11px] font-normal ' + (isReverted ? 'text-slate-400' : 'text-slate-500') + '">× ' + priceStr + '</span>' : '') +
          '</span>' +
          // 2줄: = 총액
          (costStr ? '<span class="text-xs font-bold ' + (isReverted ? 'text-slate-400 line-through' : 'text-emerald-700') + '">= ' + costStr + '</span>' : '') +
          '</div>' +
          (isReverted
            ? ''
            : '<button onclick="revertInboundEntry(\'' + escapeJs(e.id) + '\')" class="text-[11px] px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold" title="이 입고를 되돌립니다 (재고 차감, 기록 보존)">↩ 되돌리기</button>') +
          '</div></div></div>';
      });

      inHistHtml += '</div></div>';
    });
  }
  inHistHtml += '</div>';

  // ============================================
  // 주문 내역 HTML — 대기/완료/취소 탭
  // ============================================
  if (typeof window._orderStatusTab === 'undefined') window._orderStatusTab = 'pending';
  const orderTab = window._orderStatusTab;
  const pendingOrders = (orders || []).filter(o => (o.status || 'pending') === 'pending');
  const receivedOrders = (orders || []).filter(o => o.status === 'received');
  const cancelledOrders = (orders || []).filter(o => o.status === 'cancelled');

  let visibleOrders = pendingOrders;
  if (orderTab === 'received') visibleOrders = receivedOrders;
  else if (orderTab === 'cancelled') visibleOrders = cancelledOrders;
  // 최신순
  visibleOrders = visibleOrders.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  let orderHistHtml = '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-clip">' +
    '<div class="px-4 py-3 bg-slate-50 border-b border-slate-200">' +
    '<h3 class="text-base font-bold text-slate-900">📋 주문 내역</h3>' +
    '</div>' +
    // 상태 탭
    '<div class="grid grid-cols-3 gap-1 p-2 bg-slate-50 border-b border-slate-200">' +
    '<button onclick="window._orderStatusTab=\'pending\'; renderInbound();" class="py-2 rounded-lg text-xs font-bold ' +
    (orderTab === 'pending' ? 'bg-amber-500 text-white' : 'bg-white text-slate-700') + '">⏳ 대기 ' + pendingOrders.length + '</button>' +
    '<button onclick="window._orderStatusTab=\'received\'; renderInbound();" class="py-2 rounded-lg text-xs font-bold ' +
    (orderTab === 'received' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700') + '">✅ 완료 ' + receivedOrders.length + '</button>' +
    '<button onclick="window._orderStatusTab=\'cancelled\'; renderInbound();" class="py-2 rounded-lg text-xs font-bold ' +
    (orderTab === 'cancelled' ? 'bg-slate-500 text-white' : 'bg-white text-slate-700') + '">❌ 취소 ' + cancelledOrders.length + '</button>' +
    '</div>';

  if (visibleOrders.length === 0) {
    orderHistHtml += '<div class="py-8 text-center text-slate-400 text-sm">' +
      (orderTab === 'pending' ? '대기 중인 주문이 없습니다' : (orderTab === 'received' ? '입고 완료된 주문이 없습니다' : '취소된 주문이 없습니다')) + '</div>';
  } else {
    orderHistHtml += '<div class="divide-y divide-slate-100">';
    visibleOrders.forEach(o => {
      orderHistHtml += _renderOrderCard(o);
    });
    orderHistHtml += '</div>';
  }
  orderHistHtml += '</div>';

  // ============================================
  // 주문 장바구니 (orderCart) HTML
  // ============================================
  let cartHtml = '';
  if (orderCart.length > 0) {
    const cartTotal = orderCart.reduce((s, c) => s + (c.qty || 0) * (c.price || 0), 0);
    cartHtml = '<div class="bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-sm">' +
      '<div class="px-4 py-3 border-b border-amber-200">' +
      '<h3 class="text-base font-bold text-slate-900">🛒 주문 장바구니 (' + orderCart.length + '종)</h3>' +
      '</div>' +
      '<div class="divide-y divide-amber-200">';
    orderCart.forEach((c, idx) => {
      const lineCost = (c.qty || 0) * (c.price || 0);
      cartHtml += '<div class="px-4 py-3 flex items-center gap-2">' +
        '<div class="flex-1 min-w-0">' +
        '<p class="text-xs text-slate-500">' + escapeHtml(c.vendor || '') + '</p>' +
        '<p class="text-sm font-medium text-slate-900 truncate">' + escapeHtml(c.name || '') + '</p>' +
        '<p class="text-[11px] text-slate-500 mt-0.5">' + c.qty + (c.unit || '') + ' × ' +
        (c.price || 0).toLocaleString() + '원 = <strong class="text-amber-700">' + lineCost.toLocaleString() + '원</strong></p>' +
        '</div>' +
        '<button onclick="openOrderItemDialog(\'' + escapeJs(c.itemId) + '\')" class="text-[11px] px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded font-bold">✏️</button>' +
        '<button onclick="removeOrderCartItem(' + idx + ')" class="text-[11px] px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded font-bold">🗑️</button>' +
        '</div>';
    });
    cartHtml += '</div>' +
      '<div class="px-4 py-3 bg-amber-100 border-t border-amber-200 flex items-center gap-2">' +
      '<span class="text-sm text-slate-700">합계: <strong class="text-amber-700">' + cartTotal.toLocaleString() + '원</strong></span>' +
      '<button onclick="confirmOrder()" class="ml-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold">✅ 주문 등록</button>' +
      '<button onclick="clearOrderCart()" class="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-bold">비우기</button>' +
      '</div></div>';
  }

  // ============================================
  // 전체 조립
  // ============================================
  let html = '<div class="space-y-4">' +
    '<div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">' +
    '<h2 class="text-lg font-bold text-slate-900 mb-1">📦 주문/입고 관리</h2>' +
    '<p class="text-sm text-slate-600">품목을 장바구니에 담아 주문하고, 도착하면 입고 완료 처리합니다</p></div>' +
    orderHistHtml +
    cartHtml +
    inHistHtml +
    '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-clip">' +
    '<div class="sticky top-[232px] sm:top-[156px] z-30 bg-white px-3 pt-3 pb-3 shadow-sm">' +
    '<input type="text" value="' + escapeHtml(inboundSearchTerm) + '" ' +
    'oninput="inboundSearchTerm = this.value; renderInboundItems();" ' +
    'placeholder="🔍 품목 검색" class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" /></div>' +
    '<div class="px-3 py-3 border-b border-slate-100"><p class="text-xs text-slate-500 mb-2">업체:</p>' +
    '<div class="flex flex-wrap gap-1">' +
    '<button onclick="inboundSelectedVendor = \'\'; renderInbound();" class="px-3 py-1.5 text-sm rounded-full ' +
    (!inboundSelectedVendor ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">전체</button>';
  vendors.forEach(v => {
    html += '<button onclick="inboundSelectedVendor = \'' + escapeJs(v) + '\'; renderInbound();" class="px-3 py-1.5 text-sm rounded-full ' +
      (inboundSelectedVendor === v ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">' + escapeHtml(v) + '</button>';
  });
  html += '</div>';
  // 분류 필터 (업체 아래) — 요청/재고 탭과 동일 패턴
  if (categories.length > 0) {
    html += '<p class="text-xs text-slate-500 mt-3 mb-2">분류:</p>' +
      '<div class="flex flex-wrap gap-1">' +
      '<button onclick="inboundSelectedCategory = \'\'; renderInbound();" class="px-3 py-1.5 text-sm rounded-full ' +
      (!inboundSelectedCategory ? 'bg-blue-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">전체</button>';
    categories.forEach(c => {
      html += '<button onclick="inboundSelectedCategory = \'' + escapeJs(c) + '\'; renderInbound();" class="px-3 py-1.5 text-sm rounded-full ' +
        (inboundSelectedCategory === c ? 'bg-blue-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">' + escapeHtml(c) + '</button>';
    });
    html += '</div>';
  }
  html += '</div><div id="inbound-items-list" class="divide-y divide-slate-100">';

  if (filtered.length === 0) {
    html += '<div class="py-12 text-center text-slate-400">검색 결과 없음</div>';
  } else {
    filtered.forEach(item => { html += _inboundItemRowHtml(item); });
  }

  html += '</div></div></div>';
  document.getElementById('page-content').innerHTML = html;
}

// ============================================
// 입고 되돌리기 (반출 되돌리기와 동일 패턴)
// ============================================
// - inventory.stock에서 입고분 차감
// - history entry는 삭제 X, cancelled=true 플래그만 (기록 보존)
// - 통계/주간보고에서 자동 제외
function revertInboundEntry(historyId) {
  const h = (history || []).find(x => x.id === historyId);
  if (!h) { showToast('입고 내역을 찾을 수 없습니다', 'error'); return; }
  if (h.cancelled) { showToast('이미 되돌려진 입고입니다', 'info'); return; }
  if (h.type !== 'in') { showToast('입고 내역이 아닙니다', 'error'); return; }

  const item = inventory.find(i => i.id === h.itemId);
  const itemName = h.name || (item ? item.name : '품목');
  const currentStock = item ? item.stock : '?';

  askConfirmWithReason('입고 되돌리기',
    itemName + ' +' + h.qty + ' 입고를 되돌립니다.\n\n' +
    '· 재고 ' + currentStock + ' → ' + (item ? Math.max(0, currentStock - h.qty) : '?') + '\n' +
    '· 입고 기록은 삭제되지 않고 [❌ 되돌림] 표시로 보존\n' +
    '· 통계/주간보고에서 자동 제외',
    '예: 잘못 입고, 수량 오류, 반품',
    function(reason) {
      const at = new Date().toISOString();
      const by = (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '') || '관리자';

      // 1. 재고 차감 (atomic 사용 가능하면 atomic, 없으면 직접 대입)
      if (item) {
        if (typeof adjustInventoryStock === 'function') {
          adjustInventoryStock(item.id, -h.qty);
        } else {
          item.stock = Math.max(0, item.stock - h.qty);
          if (typeof upsertInventoryDoc === 'function') upsertInventoryDoc(item).catch(() => {});
        }
      }

      // 2. history cancelled 플래그
      h.cancelled = true;
      h.cancelledDate = at;
      h.cancelledBy = by;
      if (reason) h.cancelReason = reason;
      // 즉시 upsert (race 차단)
      if (typeof upsertHistoryDoc === 'function') {
        upsertHistoryDoc(h).catch(err => console.warn('inbound revert hist upsert 실패:', err));
        if (window._historyHashes) window._historyHashes.set(h.id, JSON.stringify(h));
      }

      // 3. audit log
      if (typeof logEvent === 'function') {
        logEvent('inbound', 'revert', {
          summary: '입고 되돌림: ' + itemName + ' (-' + h.qty + ')' +
                   (reason ? ' — ' + reason : ''),
          historyId: h.id,
          itemId: h.itemId,
          item: itemName,
          qty: h.qty,
          reason: reason || '',
          actionBy: by
        });
      }

      saveAll();
      updateHeaderStats();
      showToast('입고 되돌림 — 재고 ' + h.qty + '개 차감', 'success');
      renderInbound();
    }, '예, 되돌리기', 'amber');
}

// 입고 내역 년도/월 필터 setter
function setInboundFilterYear(v) {
  window._inboundFilterYear = v || '';
  renderInbound();
}
function setInboundFilterMonth(v) {
  window._inboundFilterMonth = v || '';
  renderInbound();
}
function clearInboundFilter() {
  window._inboundFilterYear = '';
  window._inboundFilterMonth = '';
  renderInbound();
}

// 입고 내역 전체 섹션 토글 (헤더 클릭 시 주차 list 펼침/접힘)
function toggleInboundHistorySection() {
  window._inboundHistoryExpanded = !window._inboundHistoryExpanded;
  renderInbound();
}

// 입고 내역 주차 헤더 토글
function toggleInboundWeek(weekKey) {
  window._inboundExpandedWeeks = window._inboundExpandedWeeks || {};
  const currentWeek = (typeof getWeekKey === 'function') ? getWeekKey(new Date()) : '';
  if (window._inboundExpandedWeeks[weekKey] === undefined) {
    // 첫 토글 — 기본값(현재주차=open, 나머지=closed)을 반대로
    window._inboundExpandedWeeks[weekKey] = !(weekKey === currentWeek);
  } else {
    window._inboundExpandedWeeks[weekKey] = !window._inboundExpandedWeeks[weekKey];
  }
  renderInbound();
}

function openInboundDialog(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;

  // 오늘 날짜 (로컬 기준, YYYY-MM-DD)
  const now = new Date();
  const todayStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModalFromBackdrop()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-emerald-50 border-b border-emerald-200">' +
    '<h3 class="text-base font-bold text-slate-900">📥 입고 수량 입력</h3></div>' +
    '<div class="px-5 py-5 overflow-y-auto">' +
    '<p class="text-xs text-slate-500 mb-1">' + categoryBadgeHtml_(item.category) + escapeHtml(item.vendor) + '</p>' +
    '<p class="text-base font-bold text-slate-900 mb-1">' + escapeHtml(item.name) + '</p>' +
    '<p class="text-sm text-slate-500 mb-5">현재 재고: <strong>' + item.stock + '</strong></p>' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">입고 수량</label>' +
    '<div class="flex items-center gap-2 mb-4">' +
    '<button onclick="adjustQty(-1)" class="w-12 h-14 bg-slate-200 hover:bg-slate-300 rounded-xl text-2xl font-bold">−</button>' +
    '<input type="number" id="inbound-qty" value="1" min="1" class="flex-1 h-14 text-center text-2xl font-bold bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" onfocus="this.select()" />' +
    '<button onclick="adjustQty(1)" class="w-12 h-14 bg-slate-200 hover:bg-slate-300 rounded-xl text-2xl font-bold">+</button>' +
    '</div>' +
    '<p class="text-xs text-slate-500 mb-4">입고 후: <span id="after-stock" class="font-bold text-emerald-700">' + (item.stock + 1) + '</span></p>' +

    // 입고 일자
    '<div class="mb-2">' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">📅 입고 일자</label>' +
    '<input type="date" id="inbound-date" value="' + todayStr + '" class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" />' +
    '</div>' +

    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="confirmInbound(\'' + item.id + '\')" class="flex-1 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700">✅ 입고 등록</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
  if (typeof markModalOpened === 'function') markModalOpened();

  const input = document.getElementById('inbound-qty');
  const after = document.getElementById('after-stock');
  input.addEventListener('input', function() {
    after.textContent = item.stock + (parseInt(this.value) || 0);
  });
  setTimeout(() => input.focus(), 100);
}

function adjustQty(delta) {
  const input = document.getElementById('inbound-qty');
  if (!input) return;
  input.value = Math.max(1, (parseInt(input.value) || 1) + delta);
  input.dispatchEvent(new Event('input'));
}

// ============================================
// 주문 카드 렌더링 (대기/완료/취소 공통)
// ============================================
function _renderOrderCard(o) {
  const status = o.status || 'pending';
  const dt = new Date(o.date);
  const dateStr = isNaN(dt.getTime()) ? '' : (dt.getMonth() + 1) + '/' + dt.getDate();
  const items = o.items || [];
  const totalCost = items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
  const totalQty = items.reduce((s, it) => s + (it.qty || 0), 0);

  let bgCls = 'bg-white hover:bg-slate-50';
  let badgeHtml = '';
  if (status === 'received') {
    bgCls = 'bg-emerald-50/40';
    const rdt = o.receivedDate ? new Date(o.receivedDate) : null;
    const rstr = rdt && !isNaN(rdt.getTime()) ? ' · ' + (rdt.getMonth() + 1) + '/' + rdt.getDate() + ' 입고' : '';
    badgeHtml = '<span class="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold">✅ 완료' + rstr + '</span>';
  } else if (status === 'cancelled') {
    bgCls = 'bg-slate-50 opacity-70';
    badgeHtml = '<span class="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded font-bold">❌ 취소</span>';
  } else {
    badgeHtml = '<span class="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-bold">⏳ 대기</span>';
  }

  let html = '<div class="px-4 py-3 ' + bgCls + '">' +
    '<div class="flex items-center gap-2 mb-2">' +
    '<span class="text-xs text-slate-500">' + dateStr + '</span>' +
    badgeHtml +
    (o.orderedBy ? '<span class="text-xs text-slate-600">👤 ' + escapeHtml(o.orderedBy) + '</span>' : '') +
    '<span class="text-xs text-slate-500">' + items.length + '종 · ' + totalQty + '개</span>' +
    '<span class="ml-auto text-sm font-bold text-slate-800">' + totalCost.toLocaleString() + '원</span>' +
    '</div>';

  // 항목 리스트
  html += '<div class="space-y-0.5 mb-2">';
  items.forEach(it => {
    const lineCost = (it.qty || 0) * (it.price || 0);
    const strike = status === 'cancelled' ? 'line-through text-slate-400' : '';
    html += '<div class="flex items-center gap-2 text-xs ' + strike + '">' +
      '<span class="text-slate-500 truncate flex-shrink min-w-0">' + escapeHtml(it.vendor || '') + ' · </span>' +
      '<span class="text-slate-800 font-medium truncate flex-1 min-w-0">' + escapeHtml(it.name || '') + '</span>' +
      '<span class="text-slate-600 whitespace-nowrap">' + (it.qty || 0) + (it.unit || '') + ' × ' +
      (it.price || 0).toLocaleString() + '원 = <strong>' + lineCost.toLocaleString() + '원</strong></span>' +
      '</div>';
  });
  html += '</div>';

  // 메모
  if (o.memo) {
    html += '<p class="text-[11px] text-slate-500 mb-2">📝 ' + escapeHtml(o.memo) + '</p>';
  }
  // 취소 사유
  if (status === 'cancelled' && o.cancelReason) {
    html += '<p class="text-[11px] text-slate-500 mb-2">❌ ' + escapeHtml(o.cancelReason) + '</p>';
  }
  // 부분 입고 이력 (대기 상태에서 일부만 받은 경우)
  if (status === 'pending' && Array.isArray(o.partialReceiveHistory) && o.partialReceiveHistory.length > 0) {
    const totalRecv = o.partialReceiveHistory.reduce((s, p) => s + (p.receivedQty || 0), 0);
    html += '<p class="text-[11px] text-emerald-700 mb-2">🟢 부분 입고됨: ' + o.partialReceiveHistory.length + '회 · 총 ' + totalRecv + '개 (잔여 표시 중)</p>';
  }
  // 부모 주문 링크 (부분 입고로 생성된 완료 주문)
  if (status === 'received' && o.parentOrderId) {
    html += '<p class="text-[11px] text-slate-500 mb-2">🔗 부분 입고분 (원 주문 분리)</p>';
  }

  // 액션 버튼
  html += '<div class="flex flex-wrap gap-1.5 pt-1">';
  if (status === 'pending') {
    html += '<button onclick="openReceiveOrderModal(\'' + escapeJs(o.id) + '\')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold">✅ 입고 완료</button>' +
      '<button onclick="editOrder(\'' + escapeJs(o.id) + '\')" class="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-xs font-bold">✏️ 수정</button>' +
      '<button onclick="cancelOrder(\'' + escapeJs(o.id) + '\')" class="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-bold">❌ 취소</button>';
  } else if (status === 'received') {
    html += '<button onclick="revertReceivedOrder(\'' + escapeJs(o.id) + '\')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold" title="입고 완료를 되돌립니다 (재고 차감, 기록 보존)">↩ 입고 되돌리기</button>';
  }
  html += '</div></div>';

  return html;
}

// ============================================
// 장바구니 추가/수정 모달 (수량 + 단가 + 메모)
// ============================================
function openOrderItemDialog(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) { showToast('품목을 찾을 수 없습니다', 'error'); return; }

  const existing = orderCart.find(c => c.itemId === itemId);
  const defaultQty = existing ? existing.qty : 1;
  const defaultPrice = existing ? existing.price : (item.price || 0);
  const defaultMemo = existing ? (existing.memo || '') : '';

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModalFromBackdrop()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-amber-50 border-b border-amber-200">' +
    '<h3 class="text-base font-bold text-slate-900">🛒 ' + (existing ? '장바구니 수정' : '장바구니 담기') + '</h3></div>' +
    '<div class="px-5 py-5">' +
    '<div class="mb-1 flex items-center gap-1">' + categoryBadgeHtml_(item.category) +
    '<span class="text-sm font-bold text-slate-700">🏢 ' + escapeHtml(item.vendor) + '</span>' +
    '</div>' +
    '<p class="text-base font-bold text-slate-900 mb-1">' + escapeHtml(item.name) + '</p>' +
    '<p class="text-sm text-slate-500 mb-4">현재 재고: <strong>' + item.stock + '</strong> · 기준: ' + (item.minStock || 0) + '</p>' +
    // 수량
    '<label class="text-sm font-bold text-slate-700 mb-1 block">주문 수량</label>' +
    '<div class="flex items-center gap-2 mb-3">' +
    '<button onclick="(function(){var i=document.getElementById(\'order-qty\');i.value=Math.max(1,(parseInt(i.value)||1)-1);i.dispatchEvent(new Event(\'input\'));})()" class="w-12 h-12 bg-slate-200 hover:bg-slate-300 rounded-xl text-xl font-bold">−</button>' +
    '<input type="number" id="order-qty" value="' + defaultQty + '" min="1" class="flex-1 h-12 text-center text-xl font-bold bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-amber-500" onfocus="this.select()" />' +
    '<button onclick="(function(){var i=document.getElementById(\'order-qty\');i.value=(parseInt(i.value)||1)+1;i.dispatchEvent(new Event(\'input\'));})()" class="w-12 h-12 bg-slate-200 hover:bg-slate-300 rounded-xl text-xl font-bold">+</button>' +
    '</div>' +
    // 단가
    '<label class="text-sm font-bold text-slate-700 mb-1 block">개당 단가 (원)</label>' +
    '<input type="number" id="order-price" value="' + defaultPrice + '" min="0" class="w-full mb-3 h-12 px-4 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-amber-500" onfocus="this.select()" />' +
    '<p class="text-xs text-slate-500 mb-4">합계: <span id="order-line-cost" class="font-bold text-amber-700">' + (defaultQty * defaultPrice).toLocaleString() + '원</span></p>' +
    // 메모
    '<label class="text-sm font-bold text-slate-700 mb-1 block">메모 <span class="font-normal text-slate-400">(선택)</span></label>' +
    '<input type="text" id="order-memo" value="' + escapeHtml(defaultMemo) + '" placeholder="예: 빨리 도착 필요" class="w-full h-12 px-4 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-amber-500" />' +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    (existing
      ? '<button onclick="removeOrderCartItemById(\'' + escapeJs(itemId) + '\')" class="px-4 py-3 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-bold">🗑️ 빼기</button>'
      : '') +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="saveOrderCartItem(\'' + escapeJs(itemId) + '\')" class="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold">' + (existing ? '저장' : '담기') + '</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
  if (typeof markModalOpened === 'function') markModalOpened();

  // 합계 실시간 업데이트
  const updateLineCost = function() {
    const q = parseInt(document.getElementById('order-qty').value) || 0;
    const p = parseInt(document.getElementById('order-price').value) || 0;
    document.getElementById('order-line-cost').textContent = (q * p).toLocaleString() + '원';
  };
  document.getElementById('order-qty').addEventListener('input', updateLineCost);
  document.getElementById('order-price').addEventListener('input', updateLineCost);
  setTimeout(() => { const el = document.getElementById('order-qty'); if (el) { el.focus(); el.select(); } }, 100);
}

function saveOrderCartItem(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  const qty = parseInt(document.getElementById('order-qty').value) || 0;
  const price = parseInt(document.getElementById('order-price').value) || 0;
  const memo = (document.getElementById('order-memo').value || '').trim();
  if (qty < 1) {
    showAlert('수량을 입력해주세요', '주문 수량은 1 이상이어야 합니다.');
    return;
  }
  const existing = orderCart.find(c => c.itemId === itemId);
  if (existing) {
    existing.qty = qty;
    existing.price = price;
    existing.memo = memo;
  } else {
    orderCart.push({
      itemId: item.id,
      vendor: item.vendor,
      name: item.name,
      unit: item.unit || '',
      qty: qty,
      price: price,
      memo: memo
    });
  }
  saveAll();
  closeModal();
  renderInbound();
}

function removeOrderCartItem(idx) {
  if (idx < 0 || idx >= orderCart.length) return;
  orderCart.splice(idx, 1);
  saveAll();
  renderInbound();
}

function removeOrderCartItemById(itemId) {
  const idx = orderCart.findIndex(c => c.itemId === itemId);
  if (idx >= 0) {
    orderCart.splice(idx, 1);
    saveAll();
    closeModal();
    renderInbound();
  }
}

function clearOrderCart() {
  if (orderCart.length === 0) return;
  askConfirm('장바구니 비우기', '담긴 ' + orderCart.length + '종을 모두 빼시겠습니까?', function() {
    orderCart.length = 0;
    saveAll();
    renderInbound();
  }, '예, 비웁니다', 'amber');
}

// ============================================
// 주문 등록 (장바구니 → orders/{id})
// ============================================
function confirmOrder() {
  if (orderCart.length === 0) return;

  // 메모 입력 모달 + 주문 일자
  const todayStr = (function() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  })();
  const totalCost = orderCart.reduce((s, c) => s + (c.qty || 0) * (c.price || 0), 0);
  const totalQty = orderCart.reduce((s, c) => s + (c.qty || 0), 0);

  // 업체별 그룹핑
  const byVendor = {};
  orderCart.forEach(c => {
    const v = c.vendor || '(업체 없음)';
    if (!byVendor[v]) byVendor[v] = [];
    byVendor[v].push(c);
  });
  const vendorNames = Object.keys(byVendor).sort((a, b) => a.localeCompare(b, 'ko'));
  let itemsHtml = '<div class="mb-4 bg-slate-50 rounded-xl p-3 max-h-48 overflow-y-auto">';
  vendorNames.forEach(v => {
    const vItems = byVendor[v];
    const vCost = vItems.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
    itemsHtml += '<div class="mb-2 last:mb-0">' +
      '<p class="text-xs font-bold text-slate-700 mb-1">🏢 ' + escapeHtml(v) +
      ' <span class="font-normal text-slate-500">(' + vItems.length + '종 · ' + vCost.toLocaleString() + '원)</span></p>';
    vItems.forEach(it => {
      itemsHtml += '<p class="text-[11px] text-slate-600 pl-3">· ' + escapeHtml(it.name) +
        ' <span class="text-slate-400">' + (it.qty || 0) + (it.unit || '') + ' × ' + (it.price || 0).toLocaleString() + '원</span></p>';
    });
    itemsHtml += '</div>';
  });
  itemsHtml += '</div>';

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModalFromBackdrop()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-amber-50 border-b border-amber-200">' +
    '<h3 class="text-base font-bold text-slate-900">📋 주문 등록 확인</h3></div>' +
    '<div class="px-5 py-5 overflow-y-auto flex-1 space-y-4">' +
    '<p class="text-sm text-slate-700">' + orderCart.length + '종 · ' + totalQty + '개 · <strong class="text-amber-700">' + totalCost.toLocaleString() + '원</strong></p>' +
    itemsHtml +
    // 주문 담당자
    '<div>' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">주문 담당자 <span class="text-red-500">*</span></label>' +
    '<div class="grid grid-cols-2 gap-2">' +
    '<button id="orderer-btn-이충현" onclick="selectOrderer(\'이충현\')" class="py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-700 hover:border-amber-400 transition">이충현</button>' +
    '<button id="orderer-btn-주경심" onclick="selectOrderer(\'주경심\')" class="py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-700 hover:border-amber-400 transition">주경심</button>' +
    '</div>' +
    '<p class="text-xs text-slate-500 mt-3 mb-1">또는 다른 사람이 주문한 경우 직접 입력:</p>' +
    '<input type="text" id="orderer-custom" oninput="onOrdererCustomInput(this.value)" placeholder="이름 입력" class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-amber-500" />' +
    '</div>' +
    // 주문 일자
    '<div>' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">📅 주문 일자</label>' +
    '<input type="date" id="order-date" value="' + todayStr + '" class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-amber-500" />' +
    '</div>' +
    // 메모
    '<div>' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">메모 <span class="font-normal text-slate-400">(선택)</span></label>' +
    '<textarea id="order-overall-memo" rows="2" placeholder="예: 5월 정기 발주" class="w-full px-3 py-2 text-sm bg-slate-50 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 resize-none"></textarea>' +
    '</div>' +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button id="order-confirm-btn" onclick="submitOrder()" disabled class="flex-1 py-3 bg-slate-200 text-slate-400 cursor-not-allowed rounded-lg font-bold">주문 담당자 선택 필요</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
  if (typeof markModalOpened === 'function') markModalOpened();
  window._pendingOrderer = null;
}

// 주문 담당자 버튼 핸들러
function selectOrderer(name) {
  window._pendingOrderer = name;
  ['이충현', '주경심'].forEach(n => {
    const b = document.getElementById('orderer-btn-' + n);
    if (!b) return;
    b.className = (n === name)
      ? 'py-3 bg-amber-600 border-2 border-amber-600 rounded-xl font-bold text-white transition'
      : 'py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-700 hover:border-amber-400 transition';
  });
  const customInput = document.getElementById('orderer-custom');
  if (customInput) customInput.value = '';
  updateOrderConfirmBtn();
}

// 직접 입력 핸들러
function onOrdererCustomInput(value) {
  const trimmed = (value || '').trim();
  if (trimmed) {
    window._pendingOrderer = trimmed;
    ['이충현', '주경심'].forEach(n => {
      const b = document.getElementById('orderer-btn-' + n);
      if (b) b.className = 'py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-700 hover:border-amber-400 transition';
    });
  } else {
    window._pendingOrderer = null;
  }
  updateOrderConfirmBtn();
}

function updateOrderConfirmBtn() {
  const btn = document.getElementById('order-confirm-btn');
  if (!btn) return;
  if (window._pendingOrderer) {
    btn.disabled = false;
    btn.className = 'flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold';
    btn.textContent = '✅ 주문 등록';
  } else {
    btn.disabled = true;
    btn.className = 'flex-1 py-3 bg-slate-200 text-slate-400 cursor-not-allowed rounded-lg font-bold';
    btn.textContent = '주문 담당자 선택 필요';
  }
}

function submitOrder() {
  if (orderCart.length === 0) { closeModal(); return; }

  const orderedBy = window._pendingOrderer;
  if (!orderedBy) {
    showAlert('주문 담당자를 선택해주세요', '실제로 주문한 사람을 입력해야 처리됩니다.\n\n[이충현] 또는 [주경심] 버튼을 누르거나,\n다른 사람이면 아래 입력 칸에\n이름을 직접 입력하세요.');
    return;
  }

  const dateInput = document.getElementById('order-date');
  const memoInput = document.getElementById('order-overall-memo');
  const dateStr = dateInput && dateInput.value;
  const orderDate = dateStr
    ? new Date(dateStr + 'T00:00:00.000Z').toISOString()
    : new Date().toISOString();
  const memo = memoInput ? (memoInput.value || '').trim() : '';

  const orderId = 'O' + Date.now();

  const newOrder = {
    id: orderId,
    date: orderDate,
    status: 'pending',
    orderedBy: orderedBy,
    memo: memo,
    items: orderCart.map(c => ({
      itemId: c.itemId,
      vendor: c.vendor,
      name: c.name,
      unit: c.unit || '',
      qty: c.qty,
      price: c.price || 0,
      memo: c.memo || ''
    })),
    editHistory: []
  };

  orders.push(newOrder);

  // 즉시 컬렉션 push (debounce 우회)
  if (typeof upsertOrderDoc === 'function') {
    upsertOrderDoc(newOrder).catch(err => console.warn('order upsert 실패:', err));
  }

  // audit log
  if (typeof logEvent === 'function') {
    const totalCost = newOrder.items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
    logEvent('order', 'create', {
      summary: '주문 등록: ' + newOrder.items.length + '종 · ' + totalCost.toLocaleString() + '원',
      orderId: orderId,
      itemCount: newOrder.items.length,
      totalCost: totalCost,
      memo: memo,
      orderedBy: orderedBy
    });
  }

  orderCart.length = 0;
  window._pendingOrderer = null;
  saveAll();
  closeModal();
  showToast('주문 등록 완료! ' + newOrder.items.length + '종 (' + orderedBy + ')', 'success');
  window._orderStatusTab = 'pending';
  renderInbound();
}

// ============================================
// 입고 완료 모달 (per-item 실제 입고 수량/단가/일자)
// ============================================
function openReceiveOrderModal(orderId) {
  const o = (orders || []).find(x => x.id === orderId);
  if (!o) { showToast('주문을 찾을 수 없습니다', 'error'); return; }
  if (o.status !== 'pending') { showToast('대기 중인 주문만 입고 처리 가능', 'info'); return; }

  const todayStr = (function() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  })();

  let itemsHtml = '';
  o.items.forEach((it, idx) => {
    itemsHtml += '<div class="px-3 py-3 bg-slate-50 rounded-xl mb-2">' +
      '<p class="text-xs text-slate-500">' + escapeHtml(it.vendor || '') + '</p>' +
      '<p class="text-sm font-bold text-slate-900 mb-2">' + escapeHtml(it.name || '') + '</p>' +
      '<div class="grid grid-cols-2 gap-2">' +
      '<div>' +
      '<label class="text-[11px] font-bold text-slate-600 mb-1 block">실제 입고 수량</label>' +
      '<input type="number" id="recv-qty-' + idx + '" value="' + (it.qty || 0) + '" min="0" class="w-full h-10 px-3 text-base bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500" onfocus="this.select()" />' +
      '</div>' +
      '<div>' +
      '<label class="text-[11px] font-bold text-slate-600 mb-1 block">실제 단가 (원)</label>' +
      '<input type="number" id="recv-price-' + idx + '" value="' + (it.price || 0) + '" min="0" class="w-full h-10 px-3 text-base bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500" onfocus="this.select()" />' +
      '</div>' +
      '</div>' +
      '<p class="text-[10px] text-slate-500 mt-1">주문: ' + (it.qty || 0) + (it.unit || '') + ' × ' + (it.price || 0).toLocaleString() + '원</p>' +
      '</div>';
  });

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModalFromBackdrop()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-emerald-50 border-b border-emerald-200">' +
    '<h3 class="text-base font-bold text-slate-900">✅ 입고 완료 처리</h3>' +
    '<p class="text-xs text-slate-600 mt-1">받은 만큼만 수량을 줄여서 처리하세요. 안 받은 분량은 자동으로 [주문 대기]에 남습니다.</p></div>' +
    '<div class="px-5 py-4 overflow-y-auto">' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">📅 입고 일자</label>' +
    '<input type="date" id="recv-date" value="' + todayStr + '" class="w-full mb-4 px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" />' +
    itemsHtml +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="confirmReceiveOrder(\'' + escapeJs(orderId) + '\')" class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold">✅ 입고 완료</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
  if (typeof markModalOpened === 'function') markModalOpened();
}

// 부분 입고: 받은 만큼만 처리 + 잔여는 주문대기 유지 (반출 부분처리와 동일 패턴)
//   - actualQty == it.qty: 전량 입고
//   - 0 < actualQty < it.qty: 부분 입고 → 받은 분량은 새 [완료] 주문에, 잔여는 원래 [대기]에 남김
//   - actualQty == 0: 안 받음 → 원래 주문에 그대로
function confirmReceiveOrder(orderId) {
  const o = (orders || []).find(x => x.id === orderId);
  if (!o) return;
  if (o.status !== 'pending') return;

  const dateInput = document.getElementById('recv-date');
  const dateStr = dateInput && dateInput.value;
  const receivedDate = dateStr
    ? new Date(dateStr + 'T00:00:00.000Z').toISOString()
    : new Date().toISOString();

  const receivedBy = (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '') || '관리자';

  // Step 1: 입력값 파싱
  const inputs = o.items.map((it, idx) => {
    const qtyEl = document.getElementById('recv-qty-' + idx);
    const priceEl = document.getElementById('recv-price-' + idx);
    const actualQty = parseInt(qtyEl && qtyEl.value) || 0;
    const actualPrice = parseInt(priceEl && priceEl.value) || (it.price || 0);
    return { it: it, actualQty: actualQty, actualPrice: actualPrice };
  });

  // Step 2: 최소 1개라도 받은 게 있는지
  const anyReceived = inputs.some(i => i.actualQty > 0);
  if (!anyReceived) {
    showAlert('입고할 항목이 없습니다',
      '하나 이상 항목의 실제 입고 수량을 1 이상으로 입력해주세요.\n' +
      '전부 입고 안 받으려면 [취소] 버튼으로 닫고\n' +
      '주문 자체를 취소하려면 ❌ 취소 버튼을 쓰세요.');
    return;
  }

  // Step 3: 분리 — 받은 분량 (received) / 잔여 (remaining)
  const receivedItemsForCompleted = [];
  const remainingItemsForPending = [];
  let totalReceivedQty = 0;
  let totalReceivedCost = 0;

  inputs.forEach((inp, idx) => {
    const it = inp.it;
    const ordered = it.qty || 0;
    let actualQty = inp.actualQty;
    const actualPrice = inp.actualPrice;

    // 주문보다 더 받았으면 actualQty까지 처리 (사용자 의도 존중 — 실제 단가 사용)
    // 단, "잔여"는 음수 안 되도록 max(0, ...)
    if (actualQty <= 0) {
      // 안 받음 → 잔여만
      remainingItemsForPending.push(Object.assign({}, it));
      return;
    }

    // 받은 분량 → 재고 증가
    const item = inventory.find(i => i.id === it.itemId);
    if (item) {
      if (typeof adjustInventoryStock === 'function') {
        adjustInventoryStock(item.id, actualQty);
      } else {
        item.stock += actualQty;
        if (typeof upsertInventoryDoc === 'function') upsertInventoryDoc(item).catch(() => {});
      }
      if (actualPrice > 0 && actualPrice !== item.price) {
        item.price = actualPrice;
        if (typeof upsertInventoryDoc === 'function') upsertInventoryDoc(item).catch(() => {});
      }
    }

    // history 'in' 기록 (orderId 링크)
    const histId = 'H' + Date.now() + '_' + idx + '_' + it.itemId + '_' + Math.random().toString(36).slice(2, 5);
    const histRec = {
      id: histId,
      type: 'in',
      date: receivedDate,
      itemId: it.itemId,
      vendor: it.vendor,
      name: it.name,
      qty: actualQty,
      unit: it.unit || '',
      price: actualPrice,
      weekKey: (typeof getWeekKey === 'function') ? getWeekKey(receivedDate) : '',
      orderId: orderId
    };
    history.push(histRec);
    if (typeof upsertHistoryDoc === 'function') {
      upsertHistoryDoc(histRec).catch(err => console.warn('order receive hist upsert 실패:', err));
      if (window._historyHashes) window._historyHashes.set(histRec.id, JSON.stringify(histRec));
    }

    // 받은 분량은 완료 주문에 포함
    receivedItemsForCompleted.push(Object.assign({}, it, {
      qty: actualQty,
      price: actualPrice,
      actualQty: actualQty,
      actualPrice: actualPrice,
      historyId: histId
    }));

    // 잔여: 주문 수량 - 실제 수량 > 0이면 대기에 남김
    const leftover = ordered - actualQty;
    if (leftover > 0) {
      remainingItemsForPending.push(Object.assign({}, it, { qty: leftover }));
    }

    totalReceivedQty += actualQty;
    totalReceivedCost += actualQty * actualPrice;
  });

  // Step 4: 주문 문서 업데이트 (분리 or 전체 완료)
  if (remainingItemsForPending.length === 0) {
    // 전량 입고 → 원래 주문을 완료로 promote
    o.status = 'received';
    o.receivedDate = receivedDate;
    o.receivedBy = receivedBy;
    o.items = receivedItemsForCompleted;
    if (typeof upsertOrderDoc === 'function') {
      upsertOrderDoc(o).catch(err => console.warn('order receive upsert 실패:', err));
    }
  } else {
    // 부분 입고 → 분리: 받은 분량은 새 완료 주문, 잔여는 원래 주문에
    const newRecvOrderId = orderId + '_recv_' + Date.now();
    const newRecvOrder = {
      id: newRecvOrderId,
      date: o.date,
      parentOrderId: orderId,
      status: 'received',
      orderedBy: o.orderedBy,
      memo: o.memo,
      items: receivedItemsForCompleted,
      receivedDate: receivedDate,
      receivedBy: receivedBy
    };
    orders.push(newRecvOrder);
    if (typeof upsertOrderDoc === 'function') {
      upsertOrderDoc(newRecvOrder).catch(err => console.warn('partial recv upsert 실패:', err));
    }

    // 원래 주문은 잔여만 남김
    o.items = remainingItemsForPending;
    o.partialReceiveHistory = o.partialReceiveHistory || [];
    o.partialReceiveHistory.push({
      at: receivedDate,
      by: receivedBy,
      receivedOrderId: newRecvOrderId,
      receivedItemCount: receivedItemsForCompleted.length,
      receivedQty: totalReceivedQty
    });
    if (typeof upsertOrderDoc === 'function') {
      upsertOrderDoc(o).catch(err => console.warn('partial pending upsert 실패:', err));
    }
  }

  // Step 5: audit
  if (typeof logEvent === 'function') {
    const partial = remainingItemsForPending.length > 0;
    logEvent('order', 'receive', {
      summary: '입고 완료: ' + receivedItemsForCompleted.length + '종 · ' + totalReceivedQty + '개 · ' + totalReceivedCost.toLocaleString() + '원' +
        (partial ? ' (부분 입고 — 잔여 ' + remainingItemsForPending.length + '종)' : ''),
      orderId: orderId,
      itemCount: receivedItemsForCompleted.length,
      totalQty: totalReceivedQty,
      totalCost: totalReceivedCost,
      partial: partial,
      remainingItemCount: remainingItemsForPending.length,
      receivedBy: receivedBy
    });
  }

  saveAll();
  updateHeaderStats();
  closeModal();
  const msg = '입고 완료! ' + receivedItemsForCompleted.length + '종 ' + totalReceivedQty + '개' +
    (remainingItemsForPending.length > 0
      ? ' (잔여 ' + remainingItemsForPending.length + '종 주문대기 유지)'
      : '');
  showToast(msg, 'success');
  // 부분 입고면 사용자가 잔여 보게 pending 탭, 전량이면 완료 탭으로
  window._orderStatusTab = (remainingItemsForPending.length > 0) ? 'pending' : 'received';
  renderInbound();
}

// ============================================
// 주문 취소 (소프트 — status='cancelled', 데이터 보존)
// ============================================
function cancelOrder(orderId) {
  const o = (orders || []).find(x => x.id === orderId);
  if (!o) return;
  if (o.status !== 'pending') {
    showToast('대기 중인 주문만 취소 가능', 'info');
    return;
  }
  const totalQty = o.items.reduce((s, it) => s + (it.qty || 0), 0);
  const totalCost = o.items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);

  askConfirmWithReason('주문 취소',
    '주문 ' + o.items.length + '종 · ' + totalQty + '개 · ' + totalCost.toLocaleString() + '원을 취소합니다.\n\n' +
    '· 데이터는 삭제되지 않고 [취소] 탭으로 이동\n' +
    '· 재고/입고기록 변동 없음',
    '예: 발주 보류, 거래처 변경, 수량 오류',
    function(reason) {
      const at = new Date().toISOString();
      const by = (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '') || '관리자';
      o.status = 'cancelled';
      o.cancelledDate = at;
      o.cancelledBy = by;
      if (reason) o.cancelReason = reason;

      if (typeof upsertOrderDoc === 'function') {
        upsertOrderDoc(o).catch(err => console.warn('order cancel upsert 실패:', err));
      }
      if (typeof logEvent === 'function') {
        logEvent('order', 'cancel', {
          summary: '주문 취소: ' + o.items.length + '종 · ' + totalCost.toLocaleString() + '원' +
                   (reason ? ' — ' + reason : ''),
          orderId: orderId,
          reason: reason || '',
          cancelledBy: by
        });
      }

      saveAll();
      showToast('주문 취소 완료', 'success');
      window._orderStatusTab = 'cancelled';
      renderInbound();
    }, '예, 취소합니다', 'red');
}

// ============================================
// 주문 수정 (대기 중만, 항목 수량/단가 편집)
// ============================================
function editOrder(orderId) {
  const o = (orders || []).find(x => x.id === orderId);
  if (!o) return;
  if (o.status !== 'pending') {
    showToast('대기 중인 주문만 수정 가능', 'info');
    return;
  }

  let itemsHtml = '';
  o.items.forEach((it, idx) => {
    itemsHtml += '<div class="px-3 py-3 bg-slate-50 rounded-xl mb-2">' +
      '<p class="text-xs text-slate-500">' + escapeHtml(it.vendor || '') + '</p>' +
      '<p class="text-sm font-bold text-slate-900 mb-2">' + escapeHtml(it.name || '') + '</p>' +
      '<div class="grid grid-cols-2 gap-2">' +
      '<div>' +
      '<label class="text-[11px] font-bold text-slate-600 mb-1 block">수량 <span class="text-slate-400 font-normal">(0=항목 제거)</span></label>' +
      '<input type="number" id="edit-qty-' + idx + '" value="' + (it.qty || 0) + '" min="0" class="w-full h-10 px-3 text-base bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" onfocus="this.select()" />' +
      '</div>' +
      '<div>' +
      '<label class="text-[11px] font-bold text-slate-600 mb-1 block">단가 (원)</label>' +
      '<input type="number" id="edit-price-' + idx + '" value="' + (it.price || 0) + '" min="0" class="w-full h-10 px-3 text-base bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" onfocus="this.select()" />' +
      '</div>' +
      '</div>' +
      '</div>';
  });

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModalFromBackdrop()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-blue-50 border-b border-blue-200">' +
    '<h3 class="text-base font-bold text-slate-900">✏️ 주문 수정</h3>' +
    '<p class="text-xs text-slate-600 mt-1">수정 이력은 보존됩니다</p></div>' +
    '<div class="px-5 py-4 overflow-y-auto">' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">메모</label>' +
    '<input type="text" id="edit-order-memo" value="' + escapeHtml(o.memo || '') + '" class="w-full mb-4 px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500" />' +
    itemsHtml +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="saveOrderEdit(\'' + escapeJs(orderId) + '\')" class="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold">저장</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
  if (typeof markModalOpened === 'function') markModalOpened();
}

function saveOrderEdit(orderId) {
  const o = (orders || []).find(x => x.id === orderId);
  if (!o) return;
  if (o.status !== 'pending') return;

  const memoEl = document.getElementById('edit-order-memo');
  const newMemo = memoEl ? (memoEl.value || '').trim() : (o.memo || '');

  const at = new Date().toISOString();
  const by = (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '') || '관리자';

  const changes = [];
  const newItems = [];
  o.items.forEach((it, idx) => {
    const qtyEl = document.getElementById('edit-qty-' + idx);
    const priceEl = document.getElementById('edit-price-' + idx);
    const newQty = parseInt(qtyEl && qtyEl.value);
    const newPrice = parseInt(priceEl && priceEl.value);
    const qtyV = isNaN(newQty) ? (it.qty || 0) : newQty;
    const priceV = isNaN(newPrice) ? (it.price || 0) : newPrice;

    if (qtyV === 0) {
      changes.push({ itemName: it.name, action: 'removed', qtyFrom: it.qty });
      return;
    }
    if (qtyV !== (it.qty || 0) || priceV !== (it.price || 0)) {
      changes.push({
        itemName: it.name,
        qtyFrom: it.qty, qtyTo: qtyV,
        priceFrom: it.price, priceTo: priceV
      });
    }
    newItems.push(Object.assign({}, it, { qty: qtyV, price: priceV }));
  });

  if (newItems.length === 0) {
    showAlert('주문에 항목이 없습니다', '항목을 1개 이상 남겨두세요.\n주문 자체를 취소하려면 ❌ 취소 버튼을 쓰세요.');
    return;
  }

  const memoChanged = newMemo !== (o.memo || '');
  if (changes.length === 0 && !memoChanged) {
    closeModal();
    return;
  }

  o.items = newItems;
  if (memoChanged) {
    changes.push({ memoFrom: o.memo || '', memoTo: newMemo });
    o.memo = newMemo;
  }
  o.editHistory = o.editHistory || [];
  o.editHistory.push({ at: at, by: by, changes: changes });

  if (typeof upsertOrderDoc === 'function') {
    upsertOrderDoc(o).catch(err => console.warn('order edit upsert 실패:', err));
  }
  if (typeof logEvent === 'function') {
    logEvent('order', 'edit', {
      summary: '주문 수정: ' + changes.length + '건 변경',
      orderId: orderId,
      changes: changes,
      editBy: by
    });
  }

  saveAll();
  closeModal();
  showToast('주문 수정 완료', 'success');
  renderInbound();
}

// ============================================
// 입고 완료 되돌리기 (received → pending, 재고 차감, history cancelled)
// ============================================
function revertReceivedOrder(orderId) {
  const o = (orders || []).find(x => x.id === orderId);
  if (!o) return;
  if (o.status !== 'received') {
    showToast('입고 완료된 주문만 되돌리기 가능', 'info');
    return;
  }
  const totalActualQty = o.items.reduce((s, it) => s + (it.actualQty || 0), 0);

  askConfirmWithReason('입고 완료 되돌리기',
    '주문을 [대기] 상태로 되돌립니다.\n\n' +
    '· 재고 ' + totalActualQty + '개 차감\n' +
    '· 입고 history는 [되돌림]으로 표시 (삭제 X)\n' +
    '· 통계/주간보고에서 자동 제외',
    '예: 수량 잘못 입력, 반품',
    function(reason) {
      const at = new Date().toISOString();
      const by = (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '') || '관리자';

      // 1. 각 항목 재고 차감 + history cancelled
      o.items.forEach(it => {
        if (!it.actualQty || it.actualQty <= 0) return;
        const item = inventory.find(i => i.id === it.itemId);
        if (item) {
          if (typeof adjustInventoryStock === 'function') {
            adjustInventoryStock(item.id, -it.actualQty);
          } else {
            item.stock = Math.max(0, item.stock - it.actualQty);
            if (typeof upsertInventoryDoc === 'function') upsertInventoryDoc(item).catch(() => {});
          }
        }
        // history 매칭 (orderId + itemId, 또는 historyId)
        const hist = (history || []).find(h =>
          h.id === it.historyId ||
          (h.orderId === orderId && h.itemId === it.itemId && !h.cancelled)
        );
        if (hist) {
          hist.cancelled = true;
          hist.cancelledDate = at;
          hist.cancelledBy = by;
          if (reason) hist.cancelReason = reason;
          if (typeof upsertHistoryDoc === 'function') {
            upsertHistoryDoc(hist).catch(err => console.warn('order revert hist upsert 실패:', err));
            if (window._historyHashes) window._historyHashes.set(hist.id, JSON.stringify(hist));
          }
        }
      });

      // 2. 주문 status 복원
      o.status = 'pending';
      o.statusHistory = o.statusHistory || [];
      o.statusHistory.push({
        revertedAt: at,
        revertedBy: by,
        prevReceivedDate: o.receivedDate,
        prevReceivedBy: o.receivedBy,
        reason: reason || ''
      });
      // received 정보 클리어 (다시 입고 처리 가능하게)
      delete o.receivedDate;
      delete o.receivedBy;

      if (typeof upsertOrderDoc === 'function') {
        upsertOrderDoc(o).catch(err => console.warn('order revert upsert 실패:', err));
      }
      if (typeof logEvent === 'function') {
        logEvent('order', 'revert', {
          summary: '입고 완료 되돌림: ' + totalActualQty + '개 차감' +
                   (reason ? ' — ' + reason : ''),
          orderId: orderId,
          totalQty: totalActualQty,
          reason: reason || '',
          revertedBy: by
        });
      }

      saveAll();
      updateHeaderStats();
      showToast('입고 되돌림 — 재고 ' + totalActualQty + '개 차감', 'success');
      window._orderStatusTab = 'pending';
      renderInbound();
    }, '예, 되돌리기', 'amber');
}

function confirmInbound(itemId) {
  const item = inventory.find(i => i.id === itemId);
  const qty = parseInt(document.getElementById('inbound-qty').value) || 0;
  if (qty < 1) {
    showAlert('수량을 입력해주세요', '입고 수량은 1 이상이어야 합니다.\n\n+ / − 버튼으로 조정하거나\n숫자를 직접 입력하세요.');
    setTimeout(() => { const el = document.getElementById('inbound-qty'); if (el) { el.focus(); el.select(); } }, 50);
    return;
  }

  // 입고 일자 (사용자 입력값, 빈 값이면 오늘)
  const dateInput = document.getElementById('inbound-date');
  const dateStr = dateInput && dateInput.value;
  const inboundDate = dateStr
    ? new Date(dateStr + 'T00:00:00.000Z').toISOString()
    : new Date().toISOString();

  item.stock += qty;
  // ⭐ price + weekKey 포함 — 통계/보고서에 정확히 잡히도록
  const histRec = {
    id: 'H' + Date.now() + '_' + itemId,
    type: 'in',
    date: inboundDate,
    itemId, vendor: item.vendor, name: item.name, qty, unit: item.unit,
    price: item.price || 0,
    weekKey: (typeof getWeekKey === 'function') ? getWeekKey(inboundDate) : ''
  };
  history.push(histRec);

  // 🔒 즉시 컬렉션 push (debounce 우회 — 입고 직후 listener echo가 옛 상태로 덮을 위험 차단)
  if (typeof upsertInventoryDoc === 'function') {
    upsertInventoryDoc(item).catch(err => console.warn('inbound inv upsert 실패:', err));
  }
  if (typeof upsertHistoryDoc === 'function') {
    upsertHistoryDoc(histRec).catch(err => console.warn('inbound hist upsert 실패:', err));
    if (window._historyHashes) window._historyHashes.set(histRec.id, JSON.stringify(histRec));
  }

  saveAll();
  updateHeaderStats();
  closeModal();
  showToast('입고 완료! ' + item.name + ' +' + qty, 'success');
  renderInbound();
}
