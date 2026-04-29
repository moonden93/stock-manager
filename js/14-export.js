// ============================================
// 14-export.js: Excel/CSV 내보내기 + 도움말
// ============================================
// 의존: 4-utils.js (formatWon)
//       5-storage.js (history, inventory, requests)
//       99-main.js (closeModal)

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// 2차원 배열 → CSV 문자열 (BOM 포함, 엑셀에서 한글 정상 표시)
function rowsToCSV(rows) {
  return '\uFEFF' + rows.map(r => r.map(csvEscape).join(',')).join('\n');
}

// 파일 다운로드 (CSV)
function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 통계 화면 → Excel(CSV) 내보내기
function exportStatsToExcel() {
  // 현재 필터 적용된 출고 데이터
  let baseHistory = history.filter(h => h.type === 'out');
  if (statsPeriod === 'month') {
    const ms = new Date(); ms.setDate(1); ms.setHours(0,0,0,0);
    baseHistory = baseHistory.filter(h => new Date(h.date) >= ms);
  } else if (statsPeriod === 'week') {
    const wa = new Date(); wa.setDate(wa.getDate() - 7);
    baseHistory = baseHistory.filter(h => new Date(h.date) >= wa);
  }
  
  if (baseHistory.length === 0) {
    showToast('내보낼 데이터가 없습니다', 'error');
    return;
  }
  
  // 기간 라벨 (파일명용)
  let periodLabel = '전체';
  if (statsPeriod === 'month') {
    const m = new Date();
    periodLabel = m.getFullYear() + '년' + (m.getMonth() + 1) + '월';
  } else if (statsPeriod === 'week') {
    periodLabel = '최근7일';
  }
  
  const today = new Date().toISOString().slice(0, 10);
  const totalQty = baseHistory.reduce((s, h) => s + h.qty, 0);
  const totalCost = baseHistory.reduce((s, h) => s + h.qty * (h.price || 0), 0);
  
  let rows = [];
  let filename = '';
  let viewLabel = '';
  
  if (statsTab === 'team') {
    viewLabel = '팀별';
    // 팀별 집계 + 팀 안에 품목 상세
    const teamStats = {};
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
    
    rows.push(['치과 재료 사용량 통계 - 팀별', '', '', '', '', '']);
    rows.push(['기간:', periodLabel, '추출일:', today, '', '']);
    rows.push(['총 사용액:', totalCost, '총 수량:', totalQty, '총 건수:', baseHistory.length]);
    rows.push([]);
    rows.push(['팀명', '업체', '품목', '단위', '수량', '금액(원)']);
    
    Object.entries(teamStats)
      .filter(([_, v]) => v.qty > 0)
      .sort((a, b) => b[1].cost - a[1].cost)
      .forEach(([teamName, ts]) => {
        // 팀 합계 행
        rows.push([teamName + ' (합계)', '', '', '', ts.qty, ts.cost]);
        // 품목 상세
        Object.values(ts.items)
          .sort((a, b) => b.cost - a.cost)
          .forEach(it => {
            rows.push(['  └ ' + teamName, it.vendor, it.name, it.unit, it.qty, it.cost]);
          });
        rows.push([]);  // 빈 줄로 팀 구분
      });
    filename = '치과재료_통계_팀별_' + periodLabel + '_' + today + '.csv';
    
  } else if (statsTab === 'vendor') {
    viewLabel = '업체별';
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
    
    rows.push(['치과 재료 사용량 통계 - 업체별', '', '', '', '']);
    rows.push(['기간:', periodLabel, '추출일:', today, '']);
    rows.push(['총 사용액:', totalCost, '총 수량:', totalQty, '']);
    rows.push([]);
    rows.push(['업체명', '품목', '단위', '수량', '금액(원)']);
    
    Object.entries(vendorStats)
      .sort((a, b) => b[1].cost - a[1].cost)
      .forEach(([vendorName, vs]) => {
        rows.push([vendorName + ' (합계)', '', '', vs.qty, vs.cost]);
        Object.values(vs.items)
          .sort((a, b) => b.cost - a.cost)
          .forEach(it => {
            rows.push(['  └ ' + vendorName, it.name, it.unit, it.qty, it.cost]);
          });
        rows.push([]);
      });
    filename = '치과재료_통계_업체별_' + periodLabel + '_' + today + '.csv';
    
  } else if (statsTab === 'weekly') {
    viewLabel = '주차별';
    const weekStats = {};
    baseHistory.forEach(h => {
      const wk = h.weekKey || getWeekKey(h.date);
      const lc = h.qty * (h.price || 0);
      if (!weekStats[wk]) weekStats[wk] = { weekKey: wk, total: 0, totalCost: 0, teams: {}, items: {} };
      weekStats[wk].total += h.qty;
      weekStats[wk].totalCost += lc;
      if (!weekStats[wk].teams[h.team]) weekStats[wk].teams[h.team] = { qty: 0, cost: 0 };
      weekStats[wk].teams[h.team].qty += h.qty;
      weekStats[wk].teams[h.team].cost += lc;
      const ik = h.vendor + '::' + h.name;
      if (!weekStats[wk].items[ik]) weekStats[wk].items[ik] = { vendor: h.vendor, name: h.name, unit: h.unit, qty: 0, cost: 0 };
      weekStats[wk].items[ik].qty += h.qty;
      weekStats[wk].items[ik].cost += lc;
    });
    
    rows.push(['치과 재료 사용량 통계 - 주차별', '', '', '', '', '']);
    rows.push(['기간:', periodLabel, '추출일:', today, '', '']);
    rows.push(['총 사용액:', totalCost, '총 수량:', totalQty, '', '']);
    rows.push([]);
    rows.push(['주차', '구분', '팀/업체', '품목', '수량', '금액(원)']);
    
    Object.values(weekStats)
      .sort((a, b) => b.weekKey.localeCompare(a.weekKey))
      .forEach(w => {
        // 주차 총합
        rows.push([w.weekKey, '주차합계', '', '', w.total, w.totalCost]);
        // 팀별 집계
        Object.entries(w.teams)
          .sort((a, b) => b[1].cost - a[1].cost)
          .forEach(([t, td]) => {
            rows.push([w.weekKey, '  팀별', t, '', td.qty, td.cost]);
          });
        // 품목 상세
        Object.values(w.items)
          .sort((a, b) => b.cost - a.cost)
          .forEach(it => {
            rows.push([w.weekKey, '    품목', it.vendor, it.name + ' (' + (it.unit || '') + ')', it.qty, it.cost]);
          });
        rows.push([]);
      });
    filename = '치과재료_통계_주차별_' + periodLabel + '_' + today + '.csv';
  }
  
  // 추가 시트 격: 출고 원장 (모든 출고 raw data)
  rows.push([]);
  rows.push(['===  출고 원장 (전체 ' + baseHistory.length + '건) ===']);
  rows.push(['날짜', '주차', '팀', '업체', '품목', '단위', '수량', '단가', '금액']);
  baseHistory
    .slice()
    .sort((a, b) => (a.weekKey || '').localeCompare(b.weekKey || '') || a.date.localeCompare(b.date))
    .forEach(h => {
      rows.push([h.date, h.weekKey || '', h.team, h.vendor, h.name, h.unit, h.qty, h.price || 0, h.qty * (h.price || 0)]);
    });
  
  const csv = rowsToCSV(rows);
  downloadCSV(filename, csv);
  showToast(viewLabel + ' 통계 다운로드 완료 (' + filename + ')', 'success');
}


// ============================================
// 도움말
// ============================================
function showHelp() {
  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[85vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-teal-50 border-b border-teal-200 flex items-center justify-between">' +
    '<h3 class="text-lg font-bold text-slate-900">📖 사용 방법</h3>' +
    '<button onclick="closeModal()" class="text-2xl text-slate-400 hover:text-slate-600">✕</button></div>' +
    '<div class="p-5 overflow-y-auto space-y-4 text-sm">' +
    '<div><h4 class="text-base font-bold text-teal-700 mb-2">📤 반출</h4>' +
    '<p class="text-slate-700 leading-relaxed">팀 → 담당자 → 품목 [+] 클릭 → 하단 [반출 완료] 버튼</p></div>' +
    '<div><h4 class="text-base font-bold text-blue-700 mb-2">📋 요청관리</h4>' +
    '<p class="text-slate-700 leading-relaxed">반출 요청 내역을 확인하고 수정/삭제할 수 있습니다.</p></div>' +
    '<div><h4 class="text-base font-bold text-emerald-700 mb-2">📥 입고</h4>' +
    '<p class="text-slate-700 leading-relaxed">새로 들어온 재료의 입고 수량을 등록합니다.</p></div>' +
    '<div><h4 class="text-base font-bold text-orange-700 mb-2">📦 재고</h4>' +
    '<p class="text-slate-700 leading-relaxed">현재 재고를 확인하고 직접 수정할 수 있습니다.</p></div>' +
    '<div><h4 class="text-base font-bold text-purple-700 mb-2">📊 통계</h4>' +
    '<p class="text-slate-700 leading-relaxed">팀별/업체별 사용량과 통계를 확인합니다.</p></div>' +
    '<div><h4 class="text-base font-bold text-purple-700 mb-2">📁 문서함</h4>' +
    '<p class="text-slate-700 leading-relaxed">계약서/주문서/거래명세서 등을 업체별로 관리합니다. PDF/이미지/엑셀/워드 모두 지원 (5MB 이하)</p></div>' +
    '<div><h4 class="text-base font-bold text-slate-700 mb-2">⚙️ 설정</h4>' +
    '<p class="text-slate-700 leading-relaxed">팀, 담당자, 업체, 품목을 추가/수정/삭제할 수 있습니다.</p></div>' +
    '<div class="bg-amber-50 border border-amber-200 rounded-lg p-3">' +
    '<p class="text-xs text-amber-900 leading-relaxed">' +
    '💡 <strong>자동 저장</strong>: 모든 작업은 이 컴퓨터에 자동 저장됩니다.<br>' +
    '인터넷 없어도 작동하고, 다음에 열어도 데이터가 그대로입니다.</p></div>' +
    '</div><div class="px-5 py-3 bg-slate-50 border-t">' +
    '<button onclick="closeModal()" class="w-full py-3 bg-teal-600 text-white rounded-lg font-bold">확인</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
}

