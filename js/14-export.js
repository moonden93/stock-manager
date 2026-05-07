// ============================================
// 14-export.js: Excel/CSV 내보내기 + 도움말
// ============================================
// 의존: 4-utils.js (formatWon)
//       5-storage.js (history, inventory, requests)
//       99-main.js (closeModal)
//       SheetJS(XLSX) 라이브러리 (index.html에서 CDN 로드)

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

// ============================================
// XLSX 유틸리티
// ============================================
// rows를 시트로 만들면서 숫자 컬럼에 천 단위 콤마 포맷 적용
function makeSheetWithFormat(rows, numericCols, headerRowCount) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  
  // 숫자 셀 천 단위 콤마 포맷
  for (let R = headerRowCount; R <= range.e.r; R++) {
    numericCols.forEach(C => {
      const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellAddr];
      if (cell && typeof cell.v === 'number') {
        cell.t = 'n';
        cell.z = '#,##0';
      }
    });
  }
  
  // 컬럼 너비 자동 조정
  const colWidths = [];
  for (let C = 0; C <= range.e.c; C++) {
    let maxLen = 8;
    for (let R = 0; R <= range.e.r; R++) {
      const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellAddr];
      if (cell && cell.v != null) {
        const s = String(cell.v);
        const len = s.replace(/[가-힣]/g, 'xx').length;
        if (len > maxLen) maxLen = len;
      }
    }
    colWidths.push({ wch: Math.min(maxLen + 2, 40) });
  }
  ws['!cols'] = colWidths;
  return ws;
}

// 엑셀 시트명 정리 (사용 불가 문자 제거, 31자 제한)
function sanitizeSheetName(name) {
  let s = String(name || 'Sheet').replace(/[\\/?*\[\]:]/g, '_');
  if (s.length > 31) s = s.slice(0, 31);
  return s || 'Sheet';
}

// ============================================
// 통계 → 진짜 Excel(.xlsx) 내보내기
// 팀별 시트 분리 + 천 단위 콤마
// ============================================
function exportStatsToExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('Excel 라이브러리 로드 실패. 페이지를 새로고침해주세요.', 'error');
    return;
  }
  
  // 현재 필터 적용된 출고 데이터 (사용자 지정 기간 포함)
  let baseHistory = history.filter(h => h.type === 'out' && !h.cancelled);
  if (statsPeriod === 'month') {
    const ms = new Date(); ms.setDate(1); ms.setHours(0,0,0,0);
    baseHistory = baseHistory.filter(h => new Date(h.date) >= ms);
  } else if (statsPeriod === 'week') {
    const wa = new Date(); wa.setDate(wa.getDate() - 7);
    baseHistory = baseHistory.filter(h => new Date(h.date) >= wa);
  } else if (statsPeriod === 'custom' && statsCustomStart && statsCustomEnd) {
    const start = new Date(statsCustomStart + 'T00:00:00');
    const end = new Date(statsCustomEnd + 'T23:59:59');
    baseHistory = baseHistory.filter(h => {
      const d = new Date(h.date);
      return d >= start && d <= end;
    });
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
  } else if (statsPeriod === 'custom' && statsCustomStart && statsCustomEnd) {
    periodLabel = statsCustomStart + '_' + statsCustomEnd;
  }
  
  const today = new Date().toISOString().slice(0, 10);
  const totalQty = baseHistory.reduce((s, h) => s + h.qty, 0);
  const totalCost = baseHistory.reduce((s, h) => s + h.qty * (h.price || 0), 0);
  
  // 새 워크북 생성
  const wb = XLSX.utils.book_new();
  
  // ============================================
  // 시트 ①: 전체 요약
  // ============================================
  const summaryRows = [
    ['치과 재료 사용량 통계 - 요약'],
    [],
    ['기간', periodLabel],
    ['추출일', today],
    ['총 사용액(원)', totalCost],
    ['총 수량', totalQty],
    ['총 건수', baseHistory.length],
    [],
    ['◆ 팀별 사용액'],
    ['팀명', '건수', '수량', '금액(원)']
  ];
  
  const teamSummary = {};
  baseHistory.forEach(h => {
    if (!teamSummary[h.team]) teamSummary[h.team] = { count: 0, qty: 0, cost: 0 };
    teamSummary[h.team].count++;
    teamSummary[h.team].qty += h.qty;
    teamSummary[h.team].cost += h.qty * (h.price || 0);
  });
  Object.entries(teamSummary)
    .sort((a, b) => b[1].cost - a[1].cost)
    .forEach(([t, v]) => summaryRows.push([t, v.count, v.qty, v.cost]));
  
  summaryRows.push([]);
  summaryRows.push(['◆ 업체별 사용액']);
  summaryRows.push(['업체명', '건수', '수량', '금액(원)']);
  
  const vendorSummary = {};
  baseHistory.forEach(h => {
    if (!vendorSummary[h.vendor]) vendorSummary[h.vendor] = { count: 0, qty: 0, cost: 0 };
    vendorSummary[h.vendor].count++;
    vendorSummary[h.vendor].qty += h.qty;
    vendorSummary[h.vendor].cost += h.qty * (h.price || 0);
  });
  Object.entries(vendorSummary)
    .sort((a, b) => b[1].cost - a[1].cost)
    .forEach(([v, d]) => summaryRows.push([v, d.count, d.qty, d.cost]));
  
  const wsSummary = makeSheetWithFormat(summaryRows, [1, 2, 3], 0);
  XLSX.utils.book_append_sheet(wb, wsSummary, '요약');
  
  // ============================================
  // 팀별 시트 (팀 하나당 시트 1개)
  // ============================================
  const teamDetail = {};
  baseHistory.forEach(h => {
    if (!teamDetail[h.team]) teamDetail[h.team] = { count: 0, qty: 0, cost: 0, items: {} };
    teamDetail[h.team].count++;
    teamDetail[h.team].qty += h.qty;
    teamDetail[h.team].cost += h.qty * (h.price || 0);
    const k = h.vendor + '::' + h.name;
    if (!teamDetail[h.team].items[k]) {
      teamDetail[h.team].items[k] = { vendor: h.vendor, name: h.name, unit: h.unit, qty: 0, cost: 0 };
    }
    teamDetail[h.team].items[k].qty += h.qty;
    teamDetail[h.team].items[k].cost += h.qty * (h.price || 0);
  });
  
  const usedNames = { '요약': true };
  
  Object.entries(teamDetail)
    .filter(([_, v]) => v.qty > 0)
    .sort((a, b) => b[1].cost - a[1].cost)
    .forEach(([teamName, ts]) => {
      const teamRows = [
        [teamName + ' 사용 내역'],
        ['기간', periodLabel],
        ['총 건수', ts.count, '총 수량', ts.qty, '총 금액', ts.cost],
        [],
        ['업체', '품목', '단위', '수량', '금액(원)']
      ];
      
      Object.values(ts.items)
        .sort((a, b) => b.cost - a.cost)
        .forEach(it => {
          teamRows.push([it.vendor, it.name, it.unit || '', it.qty, it.cost]);
        });
      
      teamRows.push([]);
      teamRows.push(['합계', '', '', ts.qty, ts.cost]);
      
      let sheetName = sanitizeSheetName(teamName);
      let suffix = 1;
      while (usedNames[sheetName]) {
        sheetName = sanitizeSheetName(teamName + '_' + (++suffix));
      }
      usedNames[sheetName] = true;
      
      const wsTeam = makeSheetWithFormat(teamRows, [3, 4], 4);
      // 3번째 줄(총 건수, 총 수량, 총 금액)도 숫자 포맷 적용
      ['B3', 'D3', 'F3'].forEach(addr => {
        const cell = wsTeam[addr];
        if (cell && typeof cell.v === 'number') {
          cell.t = 'n';
          cell.z = '#,##0';
        }
      });
      XLSX.utils.book_append_sheet(wb, wsTeam, sheetName);
    });
  
  // ============================================
  // 업체별 전체 시트
  // ============================================
  const vendorDetail = {};
  baseHistory.forEach(h => {
    if (!vendorDetail[h.vendor]) vendorDetail[h.vendor] = { count: 0, qty: 0, cost: 0, items: {} };
    vendorDetail[h.vendor].count++;
    vendorDetail[h.vendor].qty += h.qty;
    vendorDetail[h.vendor].cost += h.qty * (h.price || 0);
    const k = h.name;
    if (!vendorDetail[h.vendor].items[k]) {
      vendorDetail[h.vendor].items[k] = { name: h.name, unit: h.unit, qty: 0, cost: 0 };
    }
    vendorDetail[h.vendor].items[k].qty += h.qty;
    vendorDetail[h.vendor].items[k].cost += h.qty * (h.price || 0);
  });
  
  const vendorRows = [
    ['업체별 상세 내역'],
    ['기간', periodLabel],
    [],
    ['업체명', '품목', '단위', '수량', '금액(원)']
  ];
  
  Object.entries(vendorDetail)
    .sort((a, b) => b[1].cost - a[1].cost)
    .forEach(([vendorName, vs]) => {
      vendorRows.push([vendorName + ' (합계)', '', '', vs.qty, vs.cost]);
      Object.values(vs.items)
        .sort((a, b) => b.cost - a.cost)
        .forEach(it => {
          vendorRows.push(['  └ ' + vendorName, it.name, it.unit || '', it.qty, it.cost]);
        });
      vendorRows.push([]);
    });
  
  const wsVendor = makeSheetWithFormat(vendorRows, [3, 4], 3);
  XLSX.utils.book_append_sheet(wb, wsVendor, '업체별');
  
  // ============================================
  // 출고 원장 (raw data)
  // ============================================
  const rawRows = [
    ['출고 원장 (전체 ' + baseHistory.length + '건)'],
    ['기간', periodLabel],
    [],
    ['날짜', '주차', '팀', '업체', '품목', '단위', '수량', '단가', '금액']
  ];
  
  baseHistory
    .slice()
    .sort((a, b) => (a.weekKey || '').localeCompare(b.weekKey || '') || a.date.localeCompare(b.date))
    .forEach(h => {
      rawRows.push([
        h.date.slice(0, 10),
        h.weekKey || '',
        h.team,
        h.vendor,
        h.name,
        h.unit || '',
        h.qty,
        h.price || 0,
        h.qty * (h.price || 0)
      ]);
    });
  
  const wsRaw = makeSheetWithFormat(rawRows, [6, 7, 8], 3);
  XLSX.utils.book_append_sheet(wb, wsRaw, '출고원장');
  
  // 파일 저장
  const filename = '치과재료_통계_' + periodLabel + '_' + today + '.xlsx';
  XLSX.writeFile(wb, filename);
  showToast('Excel 다운로드 완료 (' + (Object.keys(usedNames).length + 2) + '개 시트)', 'success');
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
    '<div><h4 class="text-base font-bold text-teal-700 mb-2">📤 요청</h4>' +
    '<p class="text-slate-700 leading-relaxed">팀 → 담당자 → 품목 [+] 클릭 → 하단 [반출 요청] 버튼으로 요청을 등록합니다.</p></div>' +
    '<div><h4 class="text-base font-bold text-blue-700 mb-2">📋 반출관리</h4>' +
    '<p class="text-slate-700 leading-relaxed">요청 내역에서 체크박스로 품목을 선택하고 [반출 완료 처리]를 누르면 실제 재고가 차감됩니다. 일부만 반출하거나 수량 조절도 가능합니다.</p></div>' +
    '<div><h4 class="text-base font-bold text-emerald-700 mb-2">📥 입고</h4>' +
    '<p class="text-slate-700 leading-relaxed">새로 들어온 재료의 입고 수량을 등록합니다.</p></div>' +
    '<div><h4 class="text-base font-bold text-orange-700 mb-2">📦 재고</h4>' +
    '<p class="text-slate-700 leading-relaxed">현재 재고를 확인하고 직접 수정할 수 있습니다.</p></div>' +
    '<div><h4 class="text-base font-bold text-purple-700 mb-2">📊 통계</h4>' +
    '<p class="text-slate-700 leading-relaxed">팀별/업체별 사용량과 통계를 확인합니다. 기간을 직접 선택하거나 Excel로 다운로드할 수 있습니다.</p></div>' +
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
