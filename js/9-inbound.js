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

  // 대기 주문 / 주문필요 배지
  // - 🛒 주문중 N: 항상 표시 (중복 주문 방지)
  // - 📝 주문필요: 부족·품절 + 요청 들어옴 + 주문 안 됨 (관리자 우선 발주 신호)
  const pendingQty = (window._pendingOrderMap || {})[item.id] || 0;
  const isShort = item.stock === 0 || item.stock < item.minStock;
  const inPendingReq = (window._pendingRequestItemIdSet || new Set()).has(item.id);
  let orderBadge = '';
  if (pendingQty > 0) {
    orderBadge = ' · <span class="text-blue-600 font-bold">🛒 주문중 ' + pendingQty + '</span>';
  } else if (isShort && inPendingReq) {
    orderBadge = ' · <span class="text-orange-600 font-bold">📝 주문필요</span>';
  }

  return '<div class="px-4 py-3 hover:bg-slate-50"><div class="flex items-center gap-3">' +
    '<div class="flex-1 min-w-0">' +
    '<p class="text-xs text-slate-500">' + categoryBadgeHtml_(item.category) + escapeHtml(item.vendor) + '</p>' +
    '<p class="text-sm font-medium text-slate-900 truncate">' + escapeHtml(item.name) + '</p>' +
    '<p class="text-xs text-slate-500 mt-0.5">현재 재고: <strong>' + item.stock + '</strong>' +
    (item.price ? ' · ' + item.price.toLocaleString() + '원' : '') + orderBadge + '</p></div>' +
    '<button onclick="openOrderItemDialog(\'' + item.id + '\')" class="px-4 h-10 ' + btnCls + ' text-white rounded-lg text-base font-bold whitespace-nowrap">' + btnLabel + '</button>' +
    '</div></div>';
}

// 검색 결과 목록만 부분 갱신 (검색 input destroy 안 함 → IME 안전)
function renderInboundItems() {
  window._pendingOrderMap = (typeof getPendingOrderMap === 'function') ? getPendingOrderMap() : {};
  window._pendingRequestItemIdSet = (typeof getPendingRequestItemIdSet === 'function') ? getPendingRequestItemIdSet() : new Set();
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
  // 대기 주문 맵 + 대기 요청 Set — _inboundItemRowHtml에서 사용
  window._pendingOrderMap = (typeof getPendingOrderMap === 'function') ? getPendingOrderMap() : {};
  window._pendingRequestItemIdSet = (typeof getPendingRequestItemIdSet === 'function') ? getPendingRequestItemIdSet() : new Set();
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
            : '<button onclick="openEditInboundEntry(\'' + escapeJs(e.id) + '\')" class="text-[11px] px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded font-bold" title="업체/품명/수량/단가/일자 수정">📝 수정</button>' +
              '<button onclick="revertInboundEntry(\'' + escapeJs(e.id) + '\')" class="text-[11px] px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold" title="이 입고를 되돌립니다 (재고 차감, 기록 보존)">↩ 되돌리기</button>') +
          '</div></div></div>';
      });

      inHistHtml += '</div></div>';
    });
  }
  inHistHtml += '</div>';

  // ============================================
  // 📝 주문 필요 섹션 — 요청 들어왔는데 부족·품절 + 주문도 안 들어간 품목
  // (직접요청도 포함 — 재고 미등록은 항상 주문 필요)
  // ============================================
  const pendingOrderMap = (typeof getPendingOrderMap === 'function') ? getPendingOrderMap() : {};
  // 장바구니에 담긴 itemId 집합 — 곧 주문될 것으로 간주, 주문 필요에서 제외 ("정리" UX)
  const cartItemIds = new Set((orderCart || []).map(c => c.itemId).filter(Boolean));
  // 직접요청은 itemId가 CUSTOM_ 이거나 카트의 inventory id와 달라 itemId 매칭이 안 됨.
  // vendor+name 키로도 카트를 확인해 제외 (예: 직접요청 "인상재 건"을 품목 등록 후 카트에 담은 경우).
  const cartNameKeys = new Set((orderCart || []).map(c => (c.vendor || '') + '||' + (c.name || '')));
  // 일반 요청: itemId별 총 요청 수량 집계
  const requestedByItem = {};
  // 직접요청: vendor+name 으로 그룹핑 (같은 항목 여러 팀 요청 합산)
  const customByKey = {};
  (requests || []).forEach(r => {
    if ((r.status || 'completed') !== 'pending') return;
    const reqDate = r.date ? new Date(r.date).getTime() : Date.now();
    // "팀 · 담당자" 형태로 요청자 표시
    const requesterLabel = (r.team || '') + (r.requester ? ' · ' + r.requester : '');
    if (r.isCustom) {
      const key = (r.vendor || '') + '||' + (r.name || '');
      if (!customByKey[key]) customByKey[key] = {
        vendor: r.vendor, name: r.name, qty: 0,
        requesters: new Set(), reqIds: [], itemIds: [], oldestDate: reqDate,
        descriptions: [], memos: [], images: [],
        requesterLabels: new Set()
      };
      const g = customByKey[key];
      g.qty += (r.qty || 0);
      g.requesters.add(r.team || '');
      g.requesterLabels.add(requesterLabel);
      g.reqIds.push(r.id);
      if (r.itemId) g.itemIds.push(r.itemId);
      if (reqDate < g.oldestDate) g.oldestDate = reqDate;
      if (r.customDescription && g.descriptions.indexOf(r.customDescription) < 0) {
        g.descriptions.push(r.customDescription);
      }
      if (r.memo && g.memos.indexOf(r.memo) < 0) g.memos.push(r.memo);
      if (Array.isArray(r.customImages) && r.customImages.length > 0) {
        r.customImages.forEach(img => g.images.push(img));
      }
    } else if (r.itemId) {
      if (!requestedByItem[r.itemId]) requestedByItem[r.itemId] = {
        qty: 0, requesters: new Set(), oldestDate: reqDate, memos: [],
        requesterLabels: new Set()
      };
      const ri = requestedByItem[r.itemId];
      ri.qty += (r.qty || 0);
      ri.requesters.add(r.team || '');
      ri.requesterLabels.add(requesterLabel);
      if (reqDate < ri.oldestDate) ri.oldestDate = reqDate;
      if (r.memo && ri.memos.indexOf(r.memo) < 0) ri.memos.push(r.memo);
    }
  });
  // 주문 필요 항목 추출
  const needsOrderList = [];
  // 일반 inventory 항목
  Object.keys(requestedByItem).forEach(itemId => {
    if (pendingOrderMap[itemId] > 0) return;  // 이미 발주됨
    if (cartItemIds.has(itemId)) return;  // 장바구니에 담김 (곧 주문될 것)
    const item = (inventory || []).find(i => i.id === itemId);
    if (!item) return;
    const reqQty = requestedByItem[itemId].qty;
    const isShort = (item.stock === 0) || (item.stock < item.minStock) || (item.stock < reqQty);
    if (!isShort) return;
    needsOrderList.push({
      kind: 'inv', item: item, reqQty: reqQty,
      teamCount: requestedByItem[itemId].requesters.size,
      oldestDate: requestedByItem[itemId].oldestDate,
      memos: requestedByItem[itemId].memos || [],
      requesterLabels: Array.from(requestedByItem[itemId].requesterLabels || [])
    });
  });
  // 직접요청 항목 (재고 미등록 — 무조건 주문 필요)
  Object.entries(customByKey).forEach(([key, g]) => {
    // 장바구니에 같은 항목(vendor+name)이 담겨 있으면 제외 (곧 주문될 것)
    if (cartNameKeys.has(key)) return;
    // 그룹의 어떤 요청이든 itemId가 카트에 있으면 제외
    if (Array.isArray(g.itemIds) && g.itemIds.some(id => cartItemIds.has(id))) return;
    needsOrderList.push({
      kind: 'custom', vendor: g.vendor, name: g.name, reqQty: g.qty,
      teamCount: g.requesters.size, primaryReqId: g.reqIds[0],
      oldestDate: g.oldestDate,
      descriptions: g.descriptions || [], memos: g.memos || [], images: g.images || [],
      requesterLabels: Array.from(g.requesterLabels || [])
    });
  });
  // 정렬: 오래된 요청일수록 위로 (urgency 최우선)
  // 그 다음: custom(미등록) > 품절 > 부족, 같은 등급에선 요청 수량 큰 순
  needsOrderList.sort((a, b) => {
    // 1차: 오래된 요청 (날짜 작은 게 먼저)
    const aDate = a.oldestDate || Date.now();
    const bDate = b.oldestDate || Date.now();
    // 같은 날짜(밀리초)면 다음 기준
    if (Math.abs(aDate - bDate) > 86400000) {  // 1일 이상 차이나면 날짜 우선
      return aDate - bDate;
    }
    const sev = (n) => {
      if (n.kind === 'custom') return 0;
      if (n.item.stock === 0) return 1;
      if (n.item.stock < n.item.minStock) return 2;
      return 3;
    };
    const aSev = sev(a), bSev = sev(b);
    if (aSev !== bSev) return aSev - bSev;
    return b.reqQty - a.reqQty;
  });

  // "N일 전 요청" 라벨 + 색상 (오래될수록 빨강)
  const daysAgoLabel = (oldestDate) => {
    if (!oldestDate) return { text: '', cls: 'text-slate-500' };
    const diffMs = Date.now() - oldestDate;
    const days = Math.floor(diffMs / 86400000);
    let text, cls;
    if (days <= 0) {
      text = '오늘 요청';
      cls = 'text-slate-500';
    } else if (days === 1) {
      text = '어제 요청';
      cls = 'text-slate-600';
    } else if (days <= 3) {
      text = days + '일 전 요청';
      cls = 'text-amber-700 font-bold';
    } else if (days <= 7) {
      text = days + '일 전 요청';
      cls = 'text-orange-700 font-bold';
    } else {
      text = '⚠️ ' + days + '일 전 요청';
      cls = 'text-red-700 font-bold';
    }
    return { text, cls };
  };

  let needsOrderHtml = '';
  if (needsOrderList.length > 0) {
    needsOrderHtml = '<div class="bg-orange-50 border-2 border-orange-300 rounded-2xl shadow-sm overflow-hidden">' +
      '<div class="px-4 py-3 bg-orange-100 border-b border-orange-200">' +
      '<h3 class="text-base font-bold text-orange-900">📝 주문 필요 (' + needsOrderList.length + '종)</h3>' +
      '<p class="text-xs text-orange-700 mt-0.5">요청 들어왔는데 재고 부족 + 주문도 안 들어간 품목 (직접요청 포함)</p>' +
      '</div>' +
      '<div class="divide-y divide-orange-200">';
    needsOrderList.forEach(n => {
      const dayLbl = daysAgoLabel(n.oldestDate);
      const dateStr = n.oldestDate ? new Date(n.oldestDate).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '';
      const datePill = dayLbl.text
        ? '<span class="' + dayLbl.cls + ' ml-1">📅 ' + dayLbl.text + (dateStr ? ' (' + dateStr + ')' : '') + '</span>'
        : '';

      // 요청자 + 상세 설명 + 메모 + 사진
      let extraHtml = '';
      // 요청자 (팀·담당자) 표시 — 여러 명이면 모두 나열
      if (Array.isArray(n.requesterLabels) && n.requesterLabels.length > 0) {
        extraHtml += '<p class="text-[11px] text-slate-600 mt-1">👤 ' +
          n.requesterLabels.map(l => escapeHtml(l)).join(', ') + '</p>';
      }
      const allMemos = (n.descriptions || []).concat(n.memos || []);
      if (allMemos.length > 0) {
        extraHtml += '<div class="mt-1 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-slate-700">';
        allMemos.forEach((m, i) => {
          extraHtml += (i > 0 ? '<br>' : '') + '📝 ' + escapeHtml(m);
        });
        extraHtml += '</div>';
      }
      if (n.images && n.images.length > 0) {
        extraHtml += '<div class="mt-1 flex flex-wrap gap-1">';
        n.images.forEach((img, idx) => {
          if (img && img.data) {
            extraHtml += '<img src="' + escapeHtml(img.data) + '" alt="' + escapeHtml(img.name || '참고 사진') +
              '" class="w-12 h-12 object-cover rounded border border-slate-200 cursor-pointer hover:opacity-80" ' +
              'onclick="window.open(\'' + img.data + '\',\'_blank\')" title="' + escapeHtml(img.name || '참고 사진') + '" />';
          }
        });
        extraHtml += '</div>';
      }

      if (n.kind === 'custom') {
        // 직접요청 — 재고 미등록 → 📦 품목 추가 흐름
        needsOrderHtml += '<div class="px-4 py-3 hover:bg-orange-100/50">' +
          '<div class="flex items-center gap-3">' +
          '<div class="flex-1 min-w-0">' +
          '<p class="text-xs text-slate-500"><span class="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-[10px] font-bold mr-1">🆕 직접 요청</span>' +
          escapeHtml(n.vendor || '업체 미지정') + '</p>' +
          '<p class="text-sm font-medium text-slate-900 truncate">' + escapeHtml(n.name) + '</p>' +
          '<p class="text-xs text-slate-600 mt-0.5">📦 재고 미등록 · 요청 <strong class="text-orange-700">' + n.reqQty + '개</strong>' +
          (n.teamCount > 1 ? ' (' + n.teamCount + '팀)' : '') +
          datePill +
          '</p></div>' +
          '<button onclick="openInventoryAddFromCustom(\'' + escapeJs(n.primaryReqId) + '\')" class="px-3 h-10 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-bold whitespace-nowrap">📦 품목 추가</button>' +
          '</div>' + extraHtml + '</div>';
      } else {
        const it = n.item;
        const statusIcon = it.stock === 0 ? '🔴' : '🟡';
        const statusText = it.stock === 0 ? '품절' : '부족';
        needsOrderHtml += '<div class="px-4 py-3 hover:bg-orange-100/50">' +
          '<div class="flex items-center gap-3">' +
          '<div class="flex-1 min-w-0">' +
          '<p class="text-xs text-slate-500">' + categoryBadgeHtml_(it.category) + escapeHtml(it.vendor || '') + '</p>' +
          '<p class="text-sm font-medium text-slate-900 truncate">' + escapeHtml(it.name) + '</p>' +
          '<p class="text-xs text-slate-600 mt-0.5">' + statusIcon + ' ' + statusText +
          ' · 재고 <strong>' + it.stock + '</strong>/' + (it.minStock || 0) +
          ' · 요청 <strong class="text-orange-700">' + n.reqQty + '개</strong>' +
          (n.teamCount > 1 ? ' (' + n.teamCount + '팀)' : '') +
          datePill +
          '</p></div>' +
          '<button onclick="openOrderItemDialog(\'' + escapeJs(it.id) + '\')" class="px-3 h-10 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-bold whitespace-nowrap">+ 주문 담기</button>' +
          '</div>' + extraHtml + '</div>';
      }
    });
    needsOrderHtml += '</div></div>';
  }

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
    // 주차별 collapsible 그룹 (입고 내역과 동일 패턴)
    // 탭별로 기준 날짜 선택: 대기=주문일, 완료=입고일, 취소=취소일 (없으면 주문일)
    const dateOf = function(o) {
      if (orderTab === 'received') return o.receivedDate || o.date;
      if (orderTab === 'cancelled') return o.cancelledDate || o.date;
      return o.date;
    };
    const currentWeek = (typeof getWeekKey === 'function') ? getWeekKey(new Date()) : '';
    window._orderExpandedWeeks = window._orderExpandedWeeks || {};

    const weekGroups = {};
    visibleOrders.forEach(o => {
      const d = dateOf(o);
      const wk = (typeof getWeekKey === 'function') ? getWeekKey(d) : (d || '').slice(0, 7);
      if (!weekGroups[wk]) weekGroups[wk] = [];
      weekGroups[wk].push(o);
    });
    // 주차 키 최신순 정렬
    const orderedWeeks = Object.keys(weekGroups).sort((a, b) => b.localeCompare(a));

    orderedWeeks.forEach((wk, wi) => {
      const groupOrders = weekGroups[wk];
      const wkLabel = (typeof formatWeekLabel === 'function') ? formatWeekLabel(wk) : wk;
      // 주차별 합계: 종수/개수/금액
      let weekItemCount = 0;
      let weekQty = 0;
      let weekCost = 0;
      groupOrders.forEach(o => {
        (o.items || []).forEach(it => {
          weekItemCount++;
          weekQty += (it.qty || 0);
          weekCost += (it.qty || 0) * (it.price || 0);
        });
      });
      const weekCostStr = weekCost > 0 ? ' · ' + weekCost.toLocaleString() + '원' : '';
      const isAutoOpen = (wk === currentWeek) || (currentWeek === '' && wi === 0);
      const wkExpKey = orderTab + ':' + wk;  // 탭별 독립 상태
      const expanded = (window._orderExpandedWeeks[wkExpKey] === undefined) ? isAutoOpen : window._orderExpandedWeeks[wkExpKey];

      orderHistHtml += '<div class="' + (wi > 0 ? 'border-t-2 border-slate-200' : '') + '">' +
        '<button onclick="toggleOrderWeek(\'' + escapeJs(wkExpKey) + '\')" ' +
        'class="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center gap-2 text-left">' +
        '<span class="text-slate-500 text-xs">' + (expanded ? '▼' : '▶') + '</span>' +
        '<span class="font-bold text-slate-800 text-sm">📅 ' + escapeHtml(wkLabel) + '</span>' +
        '<span class="ml-auto text-xs text-slate-600">' + groupOrders.length + '건 · ' + weekQty + '개' + weekCostStr + '</span>' +
        '</button>' +
        '<div class="' + (expanded ? '' : 'hidden') + ' divide-y divide-slate-100">';
      // 같은 날짜+업체+담당자+상태면 한 카드로 묶음 (display 레벨)
      const merged = _mergeOrdersForDisplay(groupOrders);
      merged.forEach(m => {
        if (m.orders.length === 1) {
          orderHistHtml += _renderOrderCard(m.orders[0]);
        } else {
          orderHistHtml += _renderMergedOrderCard(m);
        }
      });
      orderHistHtml += '</div></div>';
    });
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
      const cartRef = getOrderRefForItem(c.itemId);
      const cartRefHtml = orderRefHasContent_(cartRef) ? orderRefBlockHtml_(cartRef, { showRequester: true }) : '';
      cartHtml += '<div class="px-4 py-3">' +
        '<div class="flex items-center gap-2">' +
        '<div class="flex-1 min-w-0">' +
        '<p class="text-xs text-slate-500">' + escapeHtml(c.vendor || '') + '</p>' +
        '<p class="text-sm font-medium text-slate-900 truncate">' + escapeHtml(c.name || '') + '</p>' +
        '<p class="text-[11px] text-slate-500 mt-0.5">' + c.qty + (c.unit || '') + ' × ' +
        (c.price || 0).toLocaleString() + '원 = <strong class="text-amber-700">' + lineCost.toLocaleString() + '원</strong></p>' +
        '</div>' +
        '<button onclick="openOrderItemDialog(\'' + escapeJs(c.itemId) + '\')" class="text-[11px] px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded font-bold">✏️</button>' +
        '<button onclick="removeOrderCartItem(' + idx + ')" class="text-[11px] px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded font-bold">🗑️</button>' +
        '</div>' +
        cartRefHtml +
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
    needsOrderHtml +
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
// 입고 내역 수정 (업체/품명/수량/단가/일자 모두 수정 가능)
// 수량 변경 시 재고 차이만큼 자동 조정. history record 직접 수정.
function openEditInboundEntry(historyId) {
  const h = (history || []).find(x => x.id === historyId);
  if (!h) { showToast('입고 내역을 찾을 수 없습니다', 'error'); return; }
  if (h.cancelled) { showToast('되돌려진 입고는 수정 불가', 'info'); return; }
  if (h.type !== 'in') return;

  const dateStr = h.date ? new Date(h.date).toISOString().slice(0, 10) : '';
  const vendors = [...new Set(inventory.map(i => i.vendor).filter(Boolean))].sort();
  let vendorOptions = '';
  vendors.forEach(v => {
    const sel = (v === h.vendor) ? ' selected' : '';
    vendorOptions += '<option value="' + escapeHtml(v) + '"' + sel + '>' + escapeHtml(v) + '</option>';
  });
  if (h.vendor && !vendors.includes(h.vendor)) {
    vendorOptions = '<option value="' + escapeHtml(h.vendor) + '" selected>' + escapeHtml(h.vendor) + '</option>' + vendorOptions;
  }

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModalFromBackdrop()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-blue-50 border-b border-blue-200">' +
    '<h3 class="text-base font-bold text-slate-900">📝 입고 내역 수정</h3>' +
    '<p class="text-xs text-slate-600 mt-1">수량 변경 시 재고가 자동 조정됩니다</p></div>' +
    '<div class="px-5 py-5 space-y-3 overflow-y-auto">' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">업체</label>' +
    '<select id="edit-hist-vendor-select" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl mb-2">' + vendorOptions + '</select>' +
    '<input type="text" id="edit-hist-vendor-new" placeholder="또는 새 업체 직접 입력" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl" /></div>' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">품명</label>' +
    '<input type="text" id="edit-hist-name" value="' + escapeHtml(h.name || '') + '" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl" /></div>' +
    '<div class="grid grid-cols-2 gap-2">' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">수량</label>' +
    '<input type="number" id="edit-hist-qty" value="' + (h.qty || 0) + '" min="0" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl" onfocus="this.select()" /></div>' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">단가(원)</label>' +
    '<input type="number" id="edit-hist-price" value="' + (h.price || 0) + '" min="0" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl" onfocus="this.select()" /></div>' +
    '</div>' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">📅 일자</label>' +
    '<input type="date" id="edit-hist-date" value="' + dateStr + '" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl" /></div>' +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="saveEditInboundEntry(\'' + escapeJs(historyId) + '\')" class="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold">저장</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
  if (typeof markModalOpened === 'function') markModalOpened();
}

function saveEditInboundEntry(historyId) {
  const h = (history || []).find(x => x.id === historyId);
  if (!h || h.cancelled) return;

  const newVendor = (document.getElementById('edit-hist-vendor-new').value || '').trim();
  const selVendor = (document.getElementById('edit-hist-vendor-select').value || '').trim();
  const vendor = newVendor || selVendor;
  const name = (document.getElementById('edit-hist-name').value || '').trim();
  const qty = parseInt(document.getElementById('edit-hist-qty').value) || 0;
  const price = parseInt(document.getElementById('edit-hist-price').value) || 0;
  const dateStr = document.getElementById('edit-hist-date').value;

  if (!vendor) { showAlert('업체 입력 필요', '업체를 선택하거나 입력하세요.'); return; }
  if (!name) { showAlert('품명 입력 필요', '품명을 입력하세요.'); return; }
  if (qty < 1) { showAlert('수량 오류', '수량은 1 이상이어야 합니다.'); return; }

  const newDate = dateStr ? new Date(dateStr + 'T00:00:00.000Z').toISOString() : h.date;
  const qtyDelta = qty - (h.qty || 0);  // 수량 변경분

  // 변경 이력 보존
  const changes = [];
  if (vendor !== h.vendor) changes.push({ field: 'vendor', from: h.vendor, to: vendor });
  if (name !== h.name) changes.push({ field: 'name', from: h.name, to: name });
  if (qty !== h.qty) changes.push({ field: 'qty', from: h.qty, to: qty });
  if (price !== h.price) changes.push({ field: 'price', from: h.price, to: price });
  if (newDate !== h.date) changes.push({ field: 'date', from: h.date, to: newDate });

  if (changes.length === 0) { closeModal(); return; }

  // history record 수정
  h.vendor = vendor;
  h.name = name;
  h.qty = qty;
  h.price = price;
  h.date = newDate;
  if (typeof getWeekKey === 'function') h.weekKey = getWeekKey(newDate);
  h.editHistory = h.editHistory || [];
  h.editHistory.push({
    at: new Date().toISOString(),
    by: (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '') || '관리자',
    changes: changes
  });

  if (typeof upsertHistoryDoc === 'function') {
    upsertHistoryDoc(h).catch(err => console.warn('hist edit upsert 실패:', err));
    if (window._historyHashes) window._historyHashes.set(h.id, JSON.stringify(h));
  }

  // 수량 변경되었으면 재고 자동 조정 (음수 허용)
  if (qtyDelta !== 0 && h.itemId) {
    const item = inventory.find(i => i.id === h.itemId);
    if (item) {
      if (typeof adjustInventoryStock === 'function') {
        adjustInventoryStock(item.id, qtyDelta);
      } else {
        item.stock = (item.stock || 0) + qtyDelta;
        if (typeof upsertInventoryDoc === 'function') upsertInventoryDoc(item).catch(() => {});
      }
    }
  }

  if (typeof logEvent === 'function') {
    logEvent('inbound', 'edit', {
      summary: '입고 내역 수정: ' + h.name + ' (' + changes.length + '개 필드)',
      historyId: h.id, changes: changes
    });
  }

  saveAll();
  updateHeaderStats();
  closeModal();
  showToast('입고 내역 수정 완료', 'success');
  renderInbound();
}

function revertInboundEntry(historyId) {
  const h = (history || []).find(x => x.id === historyId);
  if (!h) { showToast('입고 내역을 찾을 수 없습니다', 'error'); return; }
  if (h.cancelled) { showToast('이미 되돌려진 입고입니다', 'info'); return; }
  if (h.type !== 'in') { showToast('입고 내역이 아닙니다', 'error'); return; }

  const item = inventory.find(i => i.id === h.itemId);
  const itemName = h.name || (item ? item.name : '품목');
  const currentStock = item ? item.stock : '?';

  // 음수 허용 — 입고 후 일부 출고되었어도 정확한 회계 (109 - 130 = -21)
  // 음수면 사용자에게 경고 표시
  const expectedStock = item ? (currentStock - h.qty) : '?';
  const warnNeg = (item && expectedStock < 0)
    ? '\n\n⚠️ 재고가 음수가 됩니다 (' + expectedStock + ') — 이미 일부 출고된 후 되돌림\n' +
      '   회계 정확성을 위해 음수로 표시. 실제 재고와 다르면 재고 탭에서 수정하세요.'
    : '';
  askConfirmWithReason('입고 되돌리기',
    itemName + ' +' + h.qty + ' 입고를 되돌립니다.\n\n' +
    '· 재고 ' + currentStock + ' → ' + expectedStock + '\n' +
    '· 입고 기록은 삭제되지 않고 [❌ 되돌림] 표시로 보존\n' +
    '· 통계/주간보고에서 자동 제외' + warnNeg,
    '예: 잘못 입고, 수량 오류, 반품',
    function(reason) {
      const at = new Date().toISOString();
      const by = (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '') || '관리자';

      // 1. 재고 차감 (atomic 사용 가능하면 atomic, 없으면 직접 대입)
      // 음수 허용 — 정확한 회계가 우선
      if (item) {
        if (typeof adjustInventoryStock === 'function') {
          adjustInventoryStock(item.id, -h.qty);
        } else {
          item.stock = item.stock - h.qty;  // 음수 허용
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

// 주문 내역 주차 토글 (탭별 독립 상태 — key='tab:weekKey')
function toggleOrderWeek(wkExpKey) {
  window._orderExpandedWeeks = window._orderExpandedWeeks || {};
  const orderTab = window._orderStatusTab || 'pending';
  // 첫 토글이면 기본값(현재주차=open, 나머지=closed) 반대로
  if (window._orderExpandedWeeks[wkExpKey] === undefined) {
    const currentWeek = (typeof getWeekKey === 'function') ? getWeekKey(new Date()) : '';
    const wk = wkExpKey.split(':').slice(1).join(':'); // 'tab:weekKey'에서 weekKey 추출
    window._orderExpandedWeeks[wkExpKey] = !(wk === currentWeek);
  } else {
    window._orderExpandedWeeks[wkExpKey] = !window._orderExpandedWeeks[wkExpKey];
  }
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
// 같은 날짜(YYYY-MM-DD) + 같은 vendor (단일) + 같은 orderedBy + 같은 status 인 주문을 묶음
// 결과: [{ orders: [o1, o2, ...] }, ...] — 단일이든 다중이든 동일 구조
function _mergeOrdersForDisplay(orders) {
  const groups = [];
  const groupMap = {};
  orders.forEach(o => {
    const items = o.items || [];
    const vendors = [...new Set(items.map(it => it.vendor || ''))];
    const singleVendor = vendors.length === 1 ? vendors[0] : null;
    const dateStr = o.date ? o.date.slice(0, 10) : '';
    const key = singleVendor ? (dateStr + '|' + singleVendor + '|' + (o.orderedBy || '') + '|' + (o.status || 'pending')) : null;
    if (!key) {
      groups.push({ orders: [o] });
      return;
    }
    if (!groupMap[key]) {
      const g = { orders: [o], key: key };
      groups.push(g);
      groupMap[key] = g;
    } else {
      groupMap[key].orders.push(o);
    }
  });
  return groups;
}

// 묶인 주문 카드 — 여러 주문의 items를 통합해 한 카드로 표시
// 버튼은 묶음 전체에 일괄 적용 (각 underlying order에 dispatch)
function _renderMergedOrderCard(merged) {
  const orders = merged.orders;
  const first = orders[0];
  const status = first.status || 'pending';
  const dt = new Date(first.date);
  const dateStr = isNaN(dt.getTime()) ? '' : (dt.getMonth() + 1) + '/' + dt.getDate();

  // 모든 items 통합
  const allItems = [];
  orders.forEach(o => (o.items || []).forEach(it => allItems.push(it)));
  const totalQty = allItems.reduce((s, it) => s + (it.qty || 0), 0);
  const totalCost = allItems.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
  const orderIdsStr = orders.map(o => o.id).join(',');

  // 캐시에 group 저장 (action handler가 lookup)
  window._mergedOrderCache = window._mergedOrderCache || {};
  window._mergedOrderCache[first.id] = orders.map(o => o.id);

  let bgCls = 'bg-white hover:bg-slate-50';
  let badgeHtml = '';
  if (status === 'received') {
    bgCls = 'bg-emerald-50/40';
    const rdt = first.receivedDate ? new Date(first.receivedDate) : null;
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
    (first.orderedBy ? '<span class="text-xs text-slate-600">👤 ' + escapeHtml(first.orderedBy) + '</span>' : '') +
    '<span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">🔗 ' + orders.length + '개 묶음</span>' +
    '<span class="text-xs text-slate-500">' + allItems.length + '종 · ' + totalQty + '개</span>' +
    '<span class="ml-auto text-sm font-bold text-slate-800">' + totalCost.toLocaleString() + '원</span>' +
    '</div>';

  // 항목 리스트
  html += '<div class="space-y-0.5 mb-2">';
  allItems.forEach(it => {
    const lineCost = (it.qty || 0) * (it.price || 0);
    const strike = status === 'cancelled' ? 'line-through text-slate-400' : '';
    html += '<div class="' + (strike ? '' : 'border-b border-slate-50 pb-1 last:border-0') + '">' +
      '<div class="flex items-center gap-2 text-xs ' + strike + '">' +
      '<span class="text-slate-500 truncate flex-shrink min-w-0">' + escapeHtml(it.vendor || '') + ' · </span>' +
      '<span class="text-slate-800 font-medium truncate flex-1 min-w-0">' + escapeHtml(it.name || '') + '</span>' +
      '<span class="text-slate-600 whitespace-nowrap">' + (it.qty || 0) + (it.unit || '') + ' × ' +
      (it.price || 0).toLocaleString() + '원 = <strong>' + lineCost.toLocaleString() + '원</strong></span>' +
      '</div>' +
      (status !== 'cancelled' && orderRefHasContent_(it.ref) ? orderRefBlockHtml_(it.ref, { showRequester: true }) : '') +
      '</div>';
  });
  html += '</div>';

  // 액션 버튼 — 묶음에 일괄 적용
  html += '<div class="flex flex-wrap gap-1.5 pt-1">';
  if (status === 'pending') {
    html += '<button onclick="openReceiveOrderModalMerged(\'' + escapeJs(first.id) + '\')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold">✅ 입고 완료</button>' +
      '<button onclick="editOrderMerged(\'' + escapeJs(first.id) + '\')" class="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-xs font-bold" title="묶음 전체 항목/일자 수정">✏️ 주문수정</button>' +
      '<button onclick="cancelOrderMerged(\'' + escapeJs(first.id) + '\')" class="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-bold">❌ 취소</button>';
  } else if (status === 'received') {
    html += '<button onclick="openEditOrderDatesModalMerged(\'' + escapeJs(first.id) + '\')" class="px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-xs font-bold">📅 일자</button>';
  }
  html += '</div></div>';
  return html;
}

// 묶음 action — underlying orders 모두에 dispatch
function _getMergedOrderIds(firstId) {
  return (window._mergedOrderCache && window._mergedOrderCache[firstId]) || [firstId];
}

function cancelOrderMerged(firstId) {
  const ids = _getMergedOrderIds(firstId);
  if (ids.length === 1) return cancelOrder(firstId);
  askConfirmWithReason('주문 묶음 취소',
    ids.length + '개 주문을 모두 취소합니다.\n\n· 데이터 보존 ([취소] 탭으로 이동)\n· 재고 변동 없음',
    '예: 발주 보류, 거래처 변경',
    function(reason) {
      const at = new Date().toISOString();
      const by = (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '') || '관리자';
      ids.forEach(id => {
        const o = (orders || []).find(x => x.id === id);
        if (!o || o.status !== 'pending') return;
        o.status = 'cancelled';
        o.cancelledDate = at;
        o.cancelledBy = by;
        if (reason) o.cancelReason = reason;
        if (typeof upsertOrderDoc === 'function') upsertOrderDoc(o).catch(() => {});
      });
      if (typeof logEvent === 'function') {
        logEvent('order', 'cancel_merged', {
          summary: '주문 묶음 취소: ' + ids.length + '개', orderIds: ids, reason: reason || '', cancelledBy: by
        });
      }
      saveAll();
      showToast(ids.length + '개 주문 취소 완료', 'success');
      window._orderStatusTab = 'cancelled';
      renderInbound();
    }, '예, 취소', 'red');
}

function openEditOrderDatesModalMerged(firstId) {
  const ids = _getMergedOrderIds(firstId);
  if (ids.length === 1) return openEditOrderDatesModal(firstId);
  // 첫 주문 모달 열고 저장 시 모든 underlying 에 적용 (플래그)
  window._dateEditMergedIds = ids;
  openEditOrderDatesModal(firstId);
}

// 묶음 입고완료 — 통합 모달, 확인 시 각 underlying order에 dispatch
function openReceiveOrderModalMerged(firstId) {
  const ids = _getMergedOrderIds(firstId);
  if (ids.length === 1) return openReceiveOrderModal(firstId);

  const merged = [];  // { sourceOrderId, sourceIdx, item }
  ids.forEach(oid => {
    const o = (orders || []).find(x => x.id === oid);
    if (!o || o.status !== 'pending') return;
    (o.items || []).forEach((it, idx) => {
      merged.push({ sourceOrderId: oid, sourceIdx: idx, item: it });
    });
  });
  if (merged.length === 0) { showToast('입고 가능한 항목 없음', 'info'); return; }
  window._mergedReceiveCtx = { items: merged, orderIds: ids };

  const todayStr = (function() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  })();

  let itemsHtml = '<div class="flex items-center justify-between mb-2 px-1">' +
    '<label class="flex items-center gap-2 cursor-pointer">' +
    '<input type="checkbox" id="recv-all" checked onchange="toggleAllReceiveItems(this.checked)" class="w-5 h-5 accent-emerald-600 cursor-pointer" />' +
    '<span class="text-sm font-bold text-slate-700">전체선택</span>' +
    '</label>' +
    '<span class="text-xs text-slate-500">' + merged.length + '종 (' + ids.length + '개 주문 묶음)</span>' +
    '</div>';
  merged.forEach((m, idx) => {
    const it = m.item;
    itemsHtml += '<div id="recv-row-' + idx + '" class="px-3 py-3 bg-slate-50 rounded-xl mb-2">' +
      '<div class="flex items-start gap-2 mb-2">' +
      '<input type="checkbox" id="recv-check-' + idx + '" checked onchange="toggleReceiveItem(' + idx + ', this.checked)" class="w-5 h-5 accent-emerald-600 cursor-pointer mt-1 shrink-0" />' +
      '<div class="flex-1 min-w-0">' +
      '<p class="text-xs text-slate-500">' + escapeHtml(it.vendor || '') + '</p>' +
      '<p class="text-sm font-bold text-slate-900">' + escapeHtml(it.name || '') + '</p>' +
      '<p class="text-[10px] text-slate-500 mt-0.5">주문: ' + (it.qty || 0) + (it.unit || '') + ' × ' + (it.price || 0).toLocaleString() + '원</p>' +
      '</div></div>' +
      '<div class="flex items-center gap-2 mb-2 pl-7">' +
      '<span class="text-[11px] font-bold text-slate-600 w-16 shrink-0">실제 수량</span>' +
      '<button onclick="adjustReceiveQty(' + idx + ', -1, ' + (it.qty || 0) + ')" class="w-9 h-9 bg-slate-200 hover:bg-slate-300 rounded-lg text-lg font-bold">−</button>' +
      '<input type="number" id="recv-qty-' + idx + '" value="' + (it.qty || 0) + '" min="0" class="w-16 h-9 text-center font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500" onfocus="this.select()" />' +
      '<button onclick="adjustReceiveQty(' + idx + ', 1, ' + (it.qty || 0) + ')" class="w-9 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-lg font-bold">+</button>' +
      '<span class="text-[11px] text-slate-500">/ ' + (it.qty || 0) + '</span>' +
      '</div>' +
      '<div class="flex items-center gap-2 pl-7">' +
      '<span class="text-[11px] font-bold text-slate-600 w-16 shrink-0">실제 단가</span>' +
      '<input type="number" id="recv-price-' + idx + '" value="' + (it.price || 0) + '" min="0" class="flex-1 h-9 px-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500" onfocus="this.select()" />' +
      '<span class="text-[11px] text-slate-500">원</span>' +
      '</div>' +
      '</div>';
  });

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModalFromBackdrop()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-emerald-50 border-b border-emerald-200">' +
    '<h3 class="text-base font-bold text-slate-900">✅ 입고 완료 (' + ids.length + '개 주문 묶음)</h3>' +
    '<p class="text-xs text-slate-600 mt-1">체크 항목만 처리. 잔여는 [주문 대기]에 유지.</p></div>' +
    '<div class="px-5 py-4 overflow-y-auto">' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">📅 입고 일자</label>' +
    '<input type="date" id="recv-date" value="' + todayStr + '" class="w-full mb-4 px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" />' +
    itemsHtml +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="confirmReceiveOrderMerged()" class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold">✅ 입고 완료</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
  if (typeof markModalOpened === 'function') markModalOpened();
}

function confirmReceiveOrderMerged() {
  const ctx = window._mergedReceiveCtx;
  if (!ctx) return;
  const dateInput = document.getElementById('recv-date');
  const receivedDate = dateInput && dateInput.value
    ? new Date(dateInput.value + 'T00:00:00.000Z').toISOString()
    : new Date().toISOString();
  const receivedBy = (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '') || '관리자';

  // 각 source order별 입력값 파싱
  const perOrder = {};
  ctx.items.forEach((m, idx) => {
    const qtyEl = document.getElementById('recv-qty-' + idx);
    const priceEl = document.getElementById('recv-price-' + idx);
    const checkEl = document.getElementById('recv-check-' + idx);
    const isChecked = checkEl ? checkEl.checked : true;
    const actualQty = isChecked ? (parseInt(qtyEl && qtyEl.value) || 0) : 0;
    const actualPrice = parseInt(priceEl && priceEl.value) || (m.item.price || 0);
    if (!perOrder[m.sourceOrderId]) perOrder[m.sourceOrderId] = {};
    perOrder[m.sourceOrderId][m.sourceIdx] = { actualQty, actualPrice };
  });

  const anyReceived = Object.values(perOrder).some(a => Object.values(a).some(x => x.actualQty > 0));
  if (!anyReceived) {
    showAlert('입고할 항목 없음', '최소 1개 이상 체크 + 수량 입력하세요.');
    return;
  }

  let totalQty = 0, totalCost = 0, totalCount = 0, totalRemaining = 0;

  Object.keys(perOrder).forEach(oid => {
    const o = (orders || []).find(x => x.id === oid);
    if (!o || o.status !== 'pending') return;
    const adj = perOrder[oid];

    const receivedItems = [];
    const remainingItems = [];
    o.items.forEach((it, idx) => {
      const a = adj[idx];
      if (!a || a.actualQty <= 0) {
        remainingItems.push(Object.assign({}, it));
        return;
      }
      const invItem = inventory.find(i => i.id === it.itemId);
      if (invItem) {
        if (typeof adjustInventoryStock === 'function') {
          adjustInventoryStock(invItem.id, a.actualQty);
        } else {
          invItem.stock += a.actualQty;
          if (typeof upsertInventoryDoc === 'function') upsertInventoryDoc(invItem).catch(() => {});
        }
        if (a.actualPrice > 0 && a.actualPrice !== invItem.price) {
          invItem.price = a.actualPrice;
          if (typeof upsertInventoryDoc === 'function') upsertInventoryDoc(invItem).catch(() => {});
        }
      }
      const histId = 'H' + Date.now() + '_' + idx + '_' + it.itemId + '_' + Math.random().toString(36).slice(2, 5);
      const histRec = {
        id: histId, type: 'in', date: receivedDate,
        itemId: it.itemId, vendor: it.vendor, name: it.name,
        qty: a.actualQty, unit: it.unit || '', price: a.actualPrice,
        weekKey: (typeof getWeekKey === 'function') ? getWeekKey(receivedDate) : '',
        orderId: oid
      };
      history.push(histRec);
      if (typeof upsertHistoryDoc === 'function') {
        upsertHistoryDoc(histRec).catch(() => {});
        if (window._historyHashes) window._historyHashes.set(histRec.id, JSON.stringify(histRec));
      }
      receivedItems.push(Object.assign({}, it, {
        qty: a.actualQty, price: a.actualPrice,
        actualQty: a.actualQty, actualPrice: a.actualPrice, historyId: histId
      }));
      const leftover = (it.qty || 0) - a.actualQty;
      if (leftover > 0) remainingItems.push(Object.assign({}, it, { qty: leftover }));
      totalQty += a.actualQty;
      totalCost += a.actualQty * a.actualPrice;
      totalCount++;
    });

    if (remainingItems.length === 0 && receivedItems.length > 0) {
      o.status = 'received';
      o.receivedDate = receivedDate;
      o.receivedBy = receivedBy;
      o.items = receivedItems;
      if (typeof upsertOrderDoc === 'function') upsertOrderDoc(o).catch(() => {});
    } else if (receivedItems.length > 0) {
      const newRecvId = oid + '_recv_' + Date.now();
      const newRecv = {
        id: newRecvId, date: o.date, parentOrderId: oid,
        status: 'received', orderedBy: o.orderedBy, memo: o.memo,
        items: receivedItems, receivedDate: receivedDate, receivedBy: receivedBy
      };
      orders.push(newRecv);
      if (typeof upsertOrderDoc === 'function') upsertOrderDoc(newRecv).catch(() => {});
      o.items = remainingItems;
      o.partialReceiveHistory = o.partialReceiveHistory || [];
      o.partialReceiveHistory.push({
        at: receivedDate, by: receivedBy, receivedOrderId: newRecvId,
        receivedItemCount: receivedItems.length,
        receivedQty: receivedItems.reduce((s, x) => s + (x.qty || 0), 0)
      });
      if (typeof upsertOrderDoc === 'function') upsertOrderDoc(o).catch(() => {});
      totalRemaining++;
    }
  });

  if (typeof logEvent === 'function') {
    logEvent('order', 'receive_merged', {
      summary: '묶음 입고: ' + totalCount + '종 · ' + totalQty + '개 · ' + totalCost.toLocaleString() + '원',
      orderIds: ctx.orderIds, totalQty, totalCost, receivedBy
    });
  }

  window._mergedReceiveCtx = null;
  saveAll();
  updateHeaderStats();
  closeModal();
  showToast('입고 완료! ' + totalCount + '종 ' + totalQty + '개' + (totalRemaining > 0 ? ' (잔여 대기 유지)' : ''), 'success');
  window._orderStatusTab = (totalRemaining > 0) ? 'pending' : 'received';
  renderInbound();
}

// 묶음 주문 수정 — 모든 underlying order의 항목 통합해서 한 모달, 저장 시 각 order에 분배
function editOrderMerged(firstId) {
  const ids = _getMergedOrderIds(firstId);
  if (ids.length === 1) return editOrder(firstId);

  const merged = [];  // { sourceOrderId, sourceIdx, item }
  ids.forEach(oid => {
    const o = (orders || []).find(x => x.id === oid);
    if (!o || o.status !== 'pending') return;
    (o.items || []).forEach((it, idx) => {
      merged.push({ sourceOrderId: oid, sourceIdx: idx, item: it });
    });
  });
  if (merged.length === 0) { showToast('수정 가능한 항목 없음', 'info'); return; }
  window._mergedEditCtx = { items: merged, orderIds: ids };

  let itemsHtml = '';
  merged.forEach((m, idx) => {
    const it = m.item;
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

  const firstOrder = (orders || []).find(x => x.id === firstId);
  const orderDateInput = firstOrder && firstOrder.date ? new Date(firstOrder.date).toISOString().slice(0, 10) : '';
  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModalFromBackdrop()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-blue-50 border-b border-blue-200">' +
    '<h3 class="text-base font-bold text-slate-900">✏️ 묶음 주문 수정 (' + ids.length + '개 주문)</h3>' +
    '<p class="text-xs text-slate-600 mt-1">각 항목 수량/단가/일자 변경. 수량 0 → 항목 제거.</p></div>' +
    '<div class="px-5 py-4 overflow-y-auto flex-1">' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">📅 주문 일자 (묶음 전체)</label>' +
    '<input type="date" id="edit-merged-date" value="' + orderDateInput + '" class="w-full mb-4 px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500" />' +
    itemsHtml +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="saveOrderEditMerged()" class="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold">저장</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
  if (typeof markModalOpened === 'function') markModalOpened();
}

function saveOrderEditMerged() {
  const ctx = window._mergedEditCtx;
  if (!ctx) return;
  const at = new Date().toISOString();
  const by = (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '') || '관리자';

  // 묶음 일자 (모든 underlying에 일괄 적용)
  const dateEl = document.getElementById('edit-merged-date');
  const dateStr = dateEl && dateEl.value;
  const newDate = dateStr ? new Date(dateStr + 'T00:00:00.000Z').toISOString() : null;

  // 각 source order 별로 수정사항 정리
  const perOrder = {};  // orderId -> Map(sourceIdx -> { qty, price })
  ctx.items.forEach((m, idx) => {
    const qtyEl = document.getElementById('edit-qty-' + idx);
    const priceEl = document.getElementById('edit-price-' + idx);
    const newQty = parseInt(qtyEl && qtyEl.value);
    const newPrice = parseInt(priceEl && priceEl.value);
    const qty = isNaN(newQty) ? (m.item.qty || 0) : newQty;
    const price = isNaN(newPrice) ? (m.item.price || 0) : newPrice;
    if (!perOrder[m.sourceOrderId]) perOrder[m.sourceOrderId] = {};
    perOrder[m.sourceOrderId][m.sourceIdx] = { qty, price };
  });

  let totalChanges = 0;
  let emptyOrders = 0;

  Object.keys(perOrder).forEach(oid => {
    const o = (orders || []).find(x => x.id === oid);
    if (!o || o.status !== 'pending') return;
    const adj = perOrder[oid];
    const changes = [];
    const newItems = [];
    o.items.forEach((it, idx) => {
      const a = adj[idx];
      const qtyV = a ? a.qty : (it.qty || 0);
      const priceV = a ? a.price : (it.price || 0);
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

    // 일자 변경 처리
    const dateChanged = newDate && newDate !== o.date;
    if (dateChanged) {
      changes.push({ field: 'date', from: o.date, to: newDate });
      o.date = newDate;
    }

    if (changes.length === 0) return;

    if (newItems.length === 0) {
      // 모든 항목 제거 → 주문 취소로 전환 (소프트)
      o.status = 'cancelled';
      o.cancelledDate = at;
      o.cancelledBy = by;
      o.cancelReason = '묶음 수정에서 모든 항목 제거됨';
      emptyOrders++;
    } else {
      o.items = newItems;
    }
    o.editHistory = o.editHistory || [];
    o.editHistory.push({ at, by, changes, type: 'merged_edit' });
    if (typeof upsertOrderDoc === 'function') upsertOrderDoc(o).catch(() => {});
    totalChanges += changes.length;
  });

  if (totalChanges === 0) { closeModal(); return; }

  if (typeof logEvent === 'function') {
    logEvent('order', 'edit_merged', {
      summary: '묶음 주문 수정: ' + totalChanges + '건 변경' + (emptyOrders > 0 ? ' (' + emptyOrders + '개 주문 자동 취소)' : ''),
      orderIds: ctx.orderIds, totalChanges, emptyOrders, by
    });
  }

  window._mergedEditCtx = null;
  saveAll();
  closeModal();
  showToast('주문 수정 완료 — ' + totalChanges + '건 변경', 'success');
  renderInbound();
}

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
    html += '<div class="' + (strike ? '' : 'border-b border-slate-50 pb-1 last:border-0') + '">' +
      '<div class="flex items-center gap-2 text-xs ' + strike + '">' +
      '<span class="text-slate-500 truncate flex-shrink min-w-0">' + escapeHtml(it.vendor || '') + ' · </span>' +
      '<span class="text-slate-800 font-medium truncate flex-1 min-w-0">' + escapeHtml(it.name || '') + '</span>' +
      '<span class="text-slate-600 whitespace-nowrap">' + (it.qty || 0) + (it.unit || '') + ' × ' +
      (it.price || 0).toLocaleString() + '원 = <strong>' + lineCost.toLocaleString() + '원</strong></span>' +
      '</div>' +
      (status !== 'cancelled' && orderRefHasContent_(it.ref) ? orderRefBlockHtml_(it.ref, { showRequester: true }) : '') +
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
      '<button onclick="editOrder(\'' + escapeJs(o.id) + '\')" class="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-xs font-bold" title="항목/일자/메모 수정">✏️ 주문수정</button>' +
      '<button onclick="cancelOrder(\'' + escapeJs(o.id) + '\')" class="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-bold">❌ 취소</button>';
  } else if (status === 'received') {
    html += '<button onclick="openEditOrderDatesModal(\'' + escapeJs(o.id) + '\')" class="px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-xs font-bold" title="주문일자/입고일자 수정 (데이터 분석용)">📅 일자 수정</button>' +
      '<button onclick="revertReceivedOrder(\'' + escapeJs(o.id) + '\')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold" title="입고 완료를 되돌립니다 (재고 차감, 기록 보존)">↩ 입고 되돌리기</button>';
  }
  html += '</div></div>';

  return html;
}

// ============================================
// 장바구니 추가/수정 모달 (수량 + 단가 + 메모)
// ============================================
// ============================================
// 주문 참고 정보 — 대기 요청에서 상세설명/메모/사진/요청자를 모은다.
// 주문 담기/장바구니/주문 카드에서 "무엇을 왜 주문하는지" 그대로 보이게 함.
// ============================================
function getOrderRefForItem(itemId) {
  const ref = { descriptions: [], memos: [], images: [], requesterLabels: [] };
  if (!itemId) return ref;
  (requests || []).forEach(r => {
    if ((r.status || 'completed') !== 'pending') return;
    if (r.itemId !== itemId) return;
    const label = (r.team || '') + (r.requester ? ' · ' + r.requester : '');
    if (label && ref.requesterLabels.indexOf(label) < 0) ref.requesterLabels.push(label);
    if (r.customDescription && ref.descriptions.indexOf(r.customDescription) < 0) ref.descriptions.push(r.customDescription);
    if (r.memo && ref.memos.indexOf(r.memo) < 0) ref.memos.push(r.memo);
    if (Array.isArray(r.customImages)) {
      r.customImages.forEach(img => { if (img && img.data) ref.images.push(img); });
    }
  });
  return ref;
}

// 참고 정보 블록 HTML (요청자 / 상세설명·메모 / 사진) — 주문 표시 공통
function orderRefBlockHtml_(ref, opts) {
  opts = opts || {};
  if (!ref) return '';
  let html = '';
  if (opts.showRequester && Array.isArray(ref.requesterLabels) && ref.requesterLabels.length > 0) {
    html += '<p class="text-[11px] text-slate-600 mt-1">👤 ' + ref.requesterLabels.map(l => escapeHtml(l)).join(', ') + '</p>';
  }
  const memos = (ref.descriptions || []).concat(ref.memos || []);
  if (memos.length > 0) {
    html += '<div class="mt-1 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-slate-700">';
    memos.forEach((m, i) => { html += (i > 0 ? '<br>' : '') + '📝 ' + escapeHtml(m); });
    html += '</div>';
  }
  if (Array.isArray(ref.images) && ref.images.length > 0) {
    html += '<div class="mt-1 flex flex-wrap gap-1">';
    ref.images.forEach(img => {
      if (img && img.data) {
        html += '<img src="' + escapeHtml(img.data) + '" alt="참고 사진" ' +
          'class="w-12 h-12 object-cover rounded border border-slate-200 cursor-pointer hover:opacity-80" ' +
          'onclick="window.open(\'' + img.data + '\',\'_blank\')" title="참고 사진" />';
      }
    });
    html += '</div>';
  }
  return html;
}

// 참고 정보가 비어있는지 (요청자만 있으면 비어있는 것으로 안 봄)
function orderRefHasContent_(ref) {
  if (!ref) return false;
  return (ref.descriptions && ref.descriptions.length > 0) ||
         (ref.memos && ref.memos.length > 0) ||
         (ref.images && ref.images.length > 0);
}

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
    // 요청 참고 정보 (상세설명 / 사진 / 요청자)
    (function() {
      const ref = getOrderRefForItem(itemId);
      if (!orderRefHasContent_(ref) && !(ref.requesterLabels && ref.requesterLabels.length)) return '';
      return '<div class="mb-4 px-3 py-2 bg-teal-50 border border-teal-200 rounded-xl">' +
        '<p class="text-[11px] font-bold text-teal-800 mb-0.5">📋 요청 참고 정보</p>' +
        orderRefBlockHtml_(ref, { showRequester: true }) + '</div>';
    })() +
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
  window._orderCartDirty = true;  // 이 기기가 카트 변경 → 클라우드에 반영
  saveAll();
  closeModal();
  renderInbound();
}

function removeOrderCartItem(idx) {
  if (idx < 0 || idx >= orderCart.length) return;
  orderCart.splice(idx, 1);
  window._orderCartDirty = true;
  saveAll();
  renderInbound();
}

function removeOrderCartItemById(itemId) {
  const idx = orderCart.findIndex(c => c.itemId === itemId);
  if (idx >= 0) {
    orderCart.splice(idx, 1);
    window._orderCartDirty = true;
    saveAll();
    closeModal();
    renderInbound();
  }
}

function clearOrderCart() {
  if (orderCart.length === 0) return;
  askConfirm('장바구니 비우기', '담긴 ' + orderCart.length + '종을 모두 빼시겠습니까?', function() {
    orderCart.length = 0;
    window._orderCartDirty = true;
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

  const newItems = orderCart.map(c => {
    // 요청 참고 정보(상세설명/사진/요청자)를 주문 시점에 스냅샷으로 보존.
    // 이후 요청이 처리(상태 변경)돼도 주문 카드에서 무엇을 왜 샀는지 확인 가능.
    const ref = getOrderRefForItem(c.itemId);
    const item = {
      itemId: c.itemId,
      vendor: c.vendor,
      name: c.name,
      unit: c.unit || '',
      qty: c.qty,
      price: c.price || 0,
      memo: c.memo || ''
    };
    if (orderRefHasContent_(ref) || (ref.requesterLabels && ref.requesterLabels.length)) {
      item.ref = ref;
    }
    return item;
  });

  // 같은 날짜 + 같은 vendor (단일) + 같은 orderedBy + pending 상태인 기존 주문이 있으면 거기 합치기
  // (중복 카드 방지)
  const cartVendors = [...new Set(newItems.map(it => it.vendor || ''))];
  const singleVendor = cartVendors.length === 1 ? cartVendors[0] : null;
  const dateKey = orderDate.slice(0, 10);
  let mergeTarget = null;
  if (singleVendor) {
    mergeTarget = (orders || []).find(o =>
      (o.status || 'pending') === 'pending' &&
      o.orderedBy === orderedBy &&
      (o.date || '').slice(0, 10) === dateKey &&
      Array.isArray(o.items) && o.items.length > 0 &&
      o.items.every(it => (it.vendor || '') === singleVendor)
    );
  }

  if (mergeTarget) {
    // 기존 주문에 items 추가
    mergeTarget.items = (mergeTarget.items || []).concat(newItems);
    if (memo) {
      mergeTarget.memo = mergeTarget.memo ? (mergeTarget.memo + ' / ' + memo) : memo;
    }
    mergeTarget.editHistory = mergeTarget.editHistory || [];
    mergeTarget.editHistory.push({
      at: new Date().toISOString(),
      by: orderedBy,
      type: 'merge_added',
      changes: [{ action: 'added_items', count: newItems.length }]
    });
    if (typeof upsertOrderDoc === 'function') {
      upsertOrderDoc(mergeTarget).catch(err => console.warn('order merge upsert 실패:', err));
    }
    if (typeof logEvent === 'function') {
      const totalCost = newItems.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
      logEvent('order', 'merge_add', {
        summary: '기존 주문에 ' + newItems.length + '종 추가 · ' + totalCost.toLocaleString() + '원',
        orderId: mergeTarget.id, itemCount: newItems.length, totalCost: totalCost, orderedBy: orderedBy
      });
    }
    orderCart.length = 0;
    window._orderCartDirty = true;
    window._pendingOrderer = null;
    saveAll();
    closeModal();
    showToast('기존 주문에 ' + newItems.length + '종 추가됨 (' + orderedBy + ')', 'success');
    window._orderStatusTab = 'pending';
    renderInbound();
    return;
  }

  // 신규 주문 생성
  const orderId = 'O' + Date.now();
  const newOrder = {
    id: orderId,
    date: orderDate,
    status: 'pending',
    orderedBy: orderedBy,
    memo: memo,
    items: newItems,
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
  window._orderCartDirty = true;
  window._pendingOrderer = null;
  saveAll();
  closeModal();
  showToast('주문 등록 완료! ' + newOrder.items.length + '종 (' + orderedBy + ')', 'success');
  window._orderStatusTab = 'pending';
  renderInbound();
}

// 기존 중복 주문을 첫 번째 doc으로 통합 (콘솔에서 1회 실행)
// 같은 날짜 + 같은 vendor + 같은 orderedBy + pending 상태 doc들을 첫 번째 doc으로 합침
window.mcMergeDuplicateOrders = async function() {
  if (typeof orders === 'undefined' || !Array.isArray(orders)) {
    console.error('orders 배열 없음');
    return;
  }
  const groups = {};
  orders.forEach(o => {
    if ((o.status || 'pending') !== 'pending') return;
    const items = o.items || [];
    if (items.length === 0) return;
    const vendors = [...new Set(items.map(it => it.vendor || ''))];
    if (vendors.length !== 1) return;  // 다중 vendor는 묶지 않음
    const key = (o.date || '').slice(0, 10) + '|' + vendors[0] + '|' + (o.orderedBy || '');
    if (!groups[key]) groups[key] = [];
    groups[key].push(o);
  });

  let mergedCount = 0;
  let removedCount = 0;
  for (const key of Object.keys(groups)) {
    const grp = groups[key];
    if (grp.length < 2) continue;
    // 첫 번째를 primary로, 나머지 items 합치고 나머지 삭제
    grp.sort((a, b) => (a.id || '').localeCompare(b.id || ''));  // ID 작은 게 primary
    const primary = grp[0];
    const subordinates = grp.slice(1);
    subordinates.forEach(sub => {
      primary.items = primary.items.concat(sub.items || []);
      if (sub.memo) primary.memo = primary.memo ? (primary.memo + ' / ' + sub.memo) : sub.memo;
    });
    primary.editHistory = primary.editHistory || [];
    primary.editHistory.push({
      at: new Date().toISOString(),
      by: '관리자(콘솔)',
      type: 'merge_consolidate',
      changes: [{ mergedFromIds: subordinates.map(s => s.id), itemsAdded: subordinates.reduce((s, x) => s + (x.items || []).length, 0) }]
    });
    if (typeof upsertOrderDoc === 'function') {
      await upsertOrderDoc(primary).catch(err => console.warn('merge primary upsert 실패:', err));
    }
    // subordinates 메모리 + Firestore 삭제
    for (const sub of subordinates) {
      const idx = orders.indexOf(sub);
      if (idx >= 0) orders.splice(idx, 1);
      if (window.firebaseReady && window.firebaseDeleteDoc) {
        try {
          await window.firebaseDeleteDoc(window.firebaseDoc(window.firebaseDB, 'orders', sub.id));
          removedCount++;
        } catch (err) {
          console.warn('merge sub delete 실패:', sub.id, err);
        }
      }
    }
    mergedCount++;
    console.log('✓ 통합:', key, '→', primary.id, '(추가된 항목:', subordinates.reduce((s, x) => s + (x.items || []).length, 0), '개)');
  }
  saveAll();
  if (typeof renderInbound === 'function') renderInbound();
  console.log('🟢 완료:', mergedCount, '개 그룹 통합, ', removedCount, '개 중복 doc 삭제');
  return { mergedGroups: mergedCount, removedDocs: removedCount };
};

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

  // 전체선택 + 항목별 체크박스 + 수량 조절 (반출관리와 동일 패턴)
  let itemsHtml = '<div class="flex items-center justify-between mb-2 px-1">' +
    '<label class="flex items-center gap-2 cursor-pointer">' +
    '<input type="checkbox" id="recv-all" checked onchange="toggleAllReceiveItems(this.checked)" class="w-5 h-5 accent-emerald-600 cursor-pointer" />' +
    '<span class="text-sm font-bold text-slate-700">전체선택</span>' +
    '</label>' +
    '<span class="text-xs text-slate-500">' + o.items.length + '종</span>' +
    '</div>';
  o.items.forEach((it, idx) => {
    itemsHtml += '<div id="recv-row-' + idx + '" class="px-3 py-3 bg-slate-50 rounded-xl mb-2">' +
      '<div class="flex items-start gap-2 mb-2">' +
      '<input type="checkbox" id="recv-check-' + idx + '" checked onchange="toggleReceiveItem(' + idx + ', this.checked)" class="w-5 h-5 accent-emerald-600 cursor-pointer mt-1 shrink-0" />' +
      '<div class="flex-1 min-w-0">' +
      '<p class="text-xs text-slate-500">' + escapeHtml(it.vendor || '') + '</p>' +
      '<p class="text-sm font-bold text-slate-900">' + escapeHtml(it.name || '') + '</p>' +
      '<p class="text-[10px] text-slate-500 mt-0.5">주문: ' + (it.qty || 0) + (it.unit || '') + ' × ' + (it.price || 0).toLocaleString() + '원</p>' +
      '</div></div>' +
      // 수량 조절 (−/+ + input)
      '<div class="flex items-center gap-2 mb-2 pl-7">' +
      '<span class="text-[11px] font-bold text-slate-600 w-16 shrink-0">실제 수량</span>' +
      '<button onclick="adjustReceiveQty(' + idx + ', -1, ' + (it.qty || 0) + ')" class="w-9 h-9 bg-slate-200 hover:bg-slate-300 rounded-lg text-lg font-bold">−</button>' +
      '<input type="number" id="recv-qty-' + idx + '" value="' + (it.qty || 0) + '" min="0" class="w-16 h-9 text-center font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500" onfocus="this.select()" />' +
      '<button onclick="adjustReceiveQty(' + idx + ', 1, ' + (it.qty || 0) + ')" class="w-9 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-lg font-bold">+</button>' +
      '<span class="text-[11px] text-slate-500">/ ' + (it.qty || 0) + '</span>' +
      '</div>' +
      // 단가
      '<div class="flex items-center gap-2 pl-7">' +
      '<span class="text-[11px] font-bold text-slate-600 w-16 shrink-0">실제 단가</span>' +
      '<input type="number" id="recv-price-' + idx + '" value="' + (it.price || 0) + '" min="0" class="flex-1 h-9 px-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500" onfocus="this.select()" />' +
      '<span class="text-[11px] text-slate-500">원</span>' +
      '</div>' +
      '</div>';
  });

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModalFromBackdrop()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-emerald-50 border-b border-emerald-200">' +
    '<h3 class="text-base font-bold text-slate-900">✅ 입고 완료 처리</h3>' +
    '<p class="text-xs text-slate-600 mt-1">체크된 항목만 처리. 수량은 받은 만큼만 줄이세요. 안 받은 분량/체크 해제된 항목은 [주문 대기]에 남습니다.</p></div>' +
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

// 입고 모달 — 전체선택 토글
function toggleAllReceiveItems(checked) {
  document.querySelectorAll('[id^="recv-check-"]').forEach(cb => {
    cb.checked = checked;
    const idx = cb.id.replace('recv-check-', '');
    toggleReceiveItem(parseInt(idx, 10), checked);
  });
}

// 입고 모달 — 개별 체크 토글 (해제 시 수량 0으로, 행 회색 처리)
function toggleReceiveItem(idx, checked) {
  const row = document.getElementById('recv-row-' + idx);
  const qty = document.getElementById('recv-qty-' + idx);
  const price = document.getElementById('recv-price-' + idx);
  if (!row) return;
  if (checked) {
    row.classList.remove('opacity-50');
    if (qty) qty.disabled = false;
    if (price) price.disabled = false;
  } else {
    row.classList.add('opacity-50');
    if (qty) { qty.value = 0; qty.disabled = true; }
    if (price) price.disabled = true;
  }
  // 전체선택 체크박스 상태 갱신
  const all = document.getElementById('recv-all');
  if (all) {
    const checks = document.querySelectorAll('[id^="recv-check-"]');
    const allChecked = Array.from(checks).every(c => c.checked);
    all.checked = allChecked;
  }
}

// 입고 모달 — 수량 -/+ 조절 (0 ~ 주문수량 클램프)
function adjustReceiveQty(idx, delta, maxQty) {
  const el = document.getElementById('recv-qty-' + idx);
  if (!el) return;
  const cur = parseInt(el.value) || 0;
  const newVal = Math.max(0, cur + delta);  // 0 이상 (주문 초과는 허용 — 실제 더 받았을 수 있음)
  el.value = newVal;
  // 0이면 체크 자동 해제
  const cb = document.getElementById('recv-check-' + idx);
  if (cb && newVal === 0 && cb.checked) {
    cb.checked = false;
    toggleReceiveItem(idx, false);
  } else if (cb && newVal > 0 && !cb.checked) {
    cb.checked = true;
    toggleReceiveItem(idx, true);
  }
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
    const checkEl = document.getElementById('recv-check-' + idx);
    const isChecked = checkEl ? checkEl.checked : true;
    // 체크 해제된 항목은 actualQty=0 으로 강제 → 잔여로 보존됨
    const actualQty = isChecked ? (parseInt(qtyEl && qtyEl.value) || 0) : 0;
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

  const orderDateInput = o.date ? new Date(o.date).toISOString().slice(0, 10) : '';
  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModalFromBackdrop()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-blue-50 border-b border-blue-200">' +
    '<h3 class="text-base font-bold text-slate-900">✏️ 주문 수정</h3>' +
    '<p class="text-xs text-slate-600 mt-1">수정 이력은 보존됩니다</p></div>' +
    '<div class="px-5 py-4 overflow-y-auto">' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">📅 주문 일자</label>' +
    '<input type="date" id="edit-order-date" value="' + orderDateInput + '" class="w-full mb-4 px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500" />' +
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
  const dateEl = document.getElementById('edit-order-date');
  const dateStr = dateEl && dateEl.value;
  const newDate = dateStr ? new Date(dateStr + 'T00:00:00.000Z').toISOString() : o.date;

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
  const dateChanged = newDate !== o.date;
  if (changes.length === 0 && !memoChanged && !dateChanged) {
    closeModal();
    return;
  }

  o.items = newItems;
  if (dateChanged) {
    changes.push({ field: 'date', from: o.date, to: newDate });
    o.date = newDate;
  }
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
// 주문일자/입고일자 수정 (사후 보정 — 데이터 분석용)
// ============================================
// pending: 주문일자만 / received: 주문일자 + 입고일자
// 입고일자 변경 시 연결된 history 'in' 레코드 date + weekKey도 같이 갱신
//   → 주차별 입고 통계/보고서 일관성 유지
function openEditOrderDatesModal(orderId) {
  const o = (orders || []).find(x => x.id === orderId);
  if (!o) { showToast('주문을 찾을 수 없습니다', 'error'); return; }
  if (o.status === 'cancelled') {
    showToast('취소된 주문은 일자 수정 불가', 'info');
    return;
  }

  const isoToInput = (iso) => iso ? new Date(iso).toISOString().slice(0, 10) : '';
  const orderDateInput = isoToInput(o.date);
  const recvDateInput = isoToInput(o.receivedDate);

  const recvSection = (o.status === 'received')
    ? '<div class="mb-4">' +
      '<label class="text-sm font-bold text-slate-700 mb-2 block">📥 입고 일자</label>' +
      '<input type="date" id="edit-recv-date" value="' + recvDateInput + '" class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500" />' +
      '<p class="text-[11px] text-slate-500 mt-1">⚠️ 변경 시 연결된 입고 history도 같이 갱신됩니다 (주차별 통계 일관성)</p>' +
      '</div>'
    : '';

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModalFromBackdrop()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-purple-50 border-b border-purple-200">' +
    '<h3 class="text-base font-bold text-slate-900">📅 일자 수정</h3>' +
    '<p class="text-xs text-slate-600 mt-1">사후 보정용 — 변경 이력 보존</p></div>' +
    '<div class="px-5 py-5 overflow-y-auto">' +
    '<div class="mb-4">' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">📋 주문 일자</label>' +
    '<input type="date" id="edit-order-date" value="' + orderDateInput + '" class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500" />' +
    '</div>' +
    recvSection +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="saveOrderDates(\'' + escapeJs(orderId) + '\')" class="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold">저장</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
  if (typeof markModalOpened === 'function') markModalOpened();
}

function saveOrderDates(orderId) {
  const o = (orders || []).find(x => x.id === orderId);
  if (!o) return;
  if (o.status === 'cancelled') return;

  const orderInput = document.getElementById('edit-order-date');
  const recvInput = document.getElementById('edit-recv-date');
  const newOrderStr = orderInput && orderInput.value;
  const newRecvStr = recvInput && recvInput.value;

  if (!newOrderStr) {
    showAlert('주문 일자를 입력하세요', '주문 일자는 필수입니다.');
    return;
  }
  const newOrderDate = new Date(newOrderStr + 'T00:00:00.000Z').toISOString();

  // 묶음 일자 수정: window._dateEditMergedIds 가 있으면 모든 underlying 에도 동일 적용
  const mergedIds = window._dateEditMergedIds;
  if (mergedIds && mergedIds.length > 1) {
    window._dateEditMergedIds = null;
    const newRecvDate = (o.status === 'received' && newRecvStr)
      ? new Date(newRecvStr + 'T00:00:00.000Z').toISOString() : null;
    const by = (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '') || '관리자';
    mergedIds.forEach(id => {
      const oi = (orders || []).find(x => x.id === id);
      if (!oi || oi.status === 'cancelled') return;
      oi.date = newOrderDate;
      if (newRecvDate && oi.status === 'received') {
        oi.receivedDate = newRecvDate;
        (oi.items || []).forEach(it => {
          if (!it.historyId) return;
          const h = (history || []).find(x => x.id === it.historyId);
          if (!h) return;
          h.date = newRecvDate;
          if (typeof getWeekKey === 'function') h.weekKey = getWeekKey(newRecvDate);
          if (typeof upsertHistoryDoc === 'function') {
            upsertHistoryDoc(h).catch(() => {});
            if (window._historyHashes) window._historyHashes.set(h.id, JSON.stringify(h));
          }
        });
      }
      if (typeof upsertOrderDoc === 'function') upsertOrderDoc(oi).catch(() => {});
    });
    if (typeof logEvent === 'function') {
      logEvent('order', 'edit_dates_merged', {
        summary: '묶음 일자 수정: ' + mergedIds.length + '개 주문',
        orderIds: mergedIds, newOrderDate, newRecvDate, by
      });
    }
    saveAll();
    closeModal();
    showToast(mergedIds.length + '개 주문 일자 수정 완료', 'success');
    renderInbound();
    return;
  }

  const changes = [];
  let orderChanged = false;
  let recvChanged = false;

  if (newOrderDate !== o.date) {
    changes.push({ field: 'orderDate', from: o.date, to: newOrderDate });
    o.date = newOrderDate;
    orderChanged = true;
  }

  let newRecvDate = null;
  if (o.status === 'received' && newRecvStr) {
    newRecvDate = new Date(newRecvStr + 'T00:00:00.000Z').toISOString();
    if (newRecvDate !== o.receivedDate) {
      changes.push({ field: 'receivedDate', from: o.receivedDate, to: newRecvDate });
      o.receivedDate = newRecvDate;
      recvChanged = true;
    }
  }

  if (changes.length === 0) {
    closeModal();
    return;
  }

  // 입고일자 변경 시 연결된 history 레코드 date/weekKey도 갱신
  if (recvChanged) {
    (o.items || []).forEach(it => {
      if (!it.historyId) return;
      const h = (history || []).find(x => x.id === it.historyId);
      if (!h) return;
      h.date = newRecvDate;
      if (typeof getWeekKey === 'function') h.weekKey = getWeekKey(newRecvDate);
      if (typeof upsertHistoryDoc === 'function') {
        upsertHistoryDoc(h).catch(err => console.warn('date edit hist upsert 실패:', err));
        if (window._historyHashes) window._historyHashes.set(h.id, JSON.stringify(h));
      }
    });
  }

  const at = new Date().toISOString();
  const by = (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '') || '관리자';
  o.editHistory = o.editHistory || [];
  o.editHistory.push({ at: at, by: by, type: 'date_edit', changes: changes });

  if (typeof upsertOrderDoc === 'function') {
    upsertOrderDoc(o).catch(err => console.warn('order date edit upsert 실패:', err));
  }
  if (typeof logEvent === 'function') {
    logEvent('order', 'edit_dates', {
      summary: '일자 수정: ' + changes.map(c => c.field).join(', '),
      orderId: orderId,
      changes: changes,
      editBy: by
    });
  }

  saveAll();
  closeModal();
  showToast('일자 수정 완료', 'success');
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
