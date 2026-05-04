// ============================================
// lib-monthly.js: 월별 보고서 Excel 생성 (공유 모듈)
// ============================================
// weekly-backup.js (첫째 주 토요일에 첨부) + monthly-report.js (수동 트리거) 양쪽에서 사용

const XLSX = require('xlsx');

// 숨김 항목 lookup용 — 보고서에서 history/output에 숨김 마커
function buildHiddenSet(inventory) {
  const set = {};
  inventory.forEach(it => {
    if (it.hidden) set[(it.vendor || '') + '::' + (it.name || '')] = true;
  });
  return set;
}
function isHidden(hiddenSet, vendor, name) {
  return !!hiddenSet[(vendor || '') + '::' + (name || '')];
}

// 비용 단위 포맷 (1000원 단위, 한국식)
function formatWonPlain(n) {
  if (Math.abs(n) >= 10000) return (Math.round(n / 1000) / 10) + '만원';
  if (Math.abs(n) >= 1000) return Math.round(n / 100) / 10 + '천원';
  return Math.round(n) + '원';
}

// 팀별 자동 코멘트 (plain text — Excel용)
// items: { kind, name, vendor, thisQty, pastAvg, price, costImpact, diffPct }[]
function generateTeamCommentText(items) {
  const ups = items.filter(i => i.kind === 'up');
  const downs = items.filter(i => i.kind === 'down');
  const news = items.filter(i => i.kind === 'new');
  const gones = items.filter(i => i.kind === 'gone');

  const positiveImpact = items.filter(i => (i.costImpact || 0) > 0)
    .reduce((s, i) => s + i.costImpact, 0);
  const negativeImpact = items.filter(i => (i.costImpact || 0) < 0)
    .reduce((s, i) => s + Math.abs(i.costImpact), 0);
  const netImpact = positiveImpact - negativeImpact;

  const parts = [];

  // 패턴 시그널
  if (ups.length >= 3 && downs.length === 0) {
    parts.push('👥 환자 수/시술량 증가 시그널');
  } else if (downs.length >= 3 && ups.length === 0) {
    parts.push('📉 환자 수/시술량 감소 또는 대체재 도입');
  } else if (ups.length >= 2 && downs.length >= 2) {
    parts.push('🔄 시술 구성 변화 또는 치료 프로토콜 변경');
  }

  if (news.length >= 2) {
    parts.push('✨ ' + news.length + '개 신규 품목 → 새 시술/재료 도입 가능성');
  } else if (news.length === 1) {
    parts.push('✨ 신규 사용: ' + news[0].name);
  }

  if (gones.length >= 2) {
    parts.push('⏸ ' + gones.length + '개 품목 사용 중단 → 재고 정리 검토');
  }

  if (Math.abs(netImpact) > 1000) {
    if (netImpact > 0) parts.push('💰 평소 대비 +' + formatWonPlain(netImpact) + ' 추가 지출');
    else parts.push('💰 평소 대비 -' + formatWonPlain(Math.abs(netImpact)) + ' 절약');
  }

  if (parts.length === 0) return '✅ 평소와 비슷한 사용 패턴 — 안정적 운영';
  return parts.join(' / ');
}

// inventory에서 가격 조회
function priceLookup(inventory, history, vendor, name) {
  const inv = inventory.find(i => i.vendor === vendor && i.name === name);
  if (inv && inv.price) return inv.price;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.vendor === vendor && h.name === name && h.price) return h.price;
  }
  return 0;
}

// 컬럼 너비 + 숫자 포맷
function applyFormat(ws, numericCols, headerRowCount) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  if (Array.isArray(numericCols)) {
    for (let R = (headerRowCount || 1); R <= range.e.r; R++) {
      numericCols.forEach(C => {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr];
        if (cell && typeof cell.v === 'number') {
          cell.t = 'n';
          cell.z = '#,##0';
        }
      });
    }
  }
  const cols = [];
  for (let C = 0; C <= range.e.c; C++) {
    let maxLen = 8;
    for (let R = 0; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell && cell.v != null) {
        const s = String(cell.v);
        const len = s.replace(/[가-힣]/g, 'xx').length;
        if (len > maxLen) maxLen = len;
      }
    }
    cols.push({ wch: Math.min(maxLen + 2, 40) });
  }
  ws['!cols'] = cols;
}

// data: { inventory, history, requests, teams, teamMembers, documents }
// year: 2026, month: 4 (1-based)
function generateMonthlyReportExcel(data, year, month) {
  const inventory = data.inventory || [];
  const history = data.history || [];
  const requests = data.requests || [];
  const teams = data.teams || [];
  const documents = data.documents || [];

  const wb = XLSX.utils.book_new();
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const monthLabel = year + '년 ' + month + '월';
  const lastDay = new Date(year, month, 0).getDate();
  const periodLabel = year + '-' + String(month).padStart(2, '0') + '-01 ~ ' +
                      year + '-' + String(month).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');

  // 해당 월 출고/입고
  const monthOut = history.filter(h => {
    if (h.type !== 'out') return false;
    const d = new Date(h.date);
    return d >= monthStart && d < monthEnd;
  });
  const monthIn = history.filter(h => {
    if (h.type !== 'in') return false;
    const d = new Date(h.date);
    return d >= monthStart && d < monthEnd;
  });

  const totalOutQty = monthOut.reduce((s, h) => s + (h.qty || 0), 0);
  const totalOutCost = monthOut.reduce((s, h) => s + (h.qty || 0) * (h.price || 0), 0);
  const totalInQty = monthIn.reduce((s, h) => s + (h.qty || 0), 0);

  // 1. 요약
  const totalCost = inventory.reduce((s, it) => s + (it.stock || 0) * (it.price || 0), 0);
  const lowStock = inventory.filter(it => it.stock > 0 && it.stock <= it.minStock).length;
  const outOfStock = inventory.filter(it => it.stock === 0).length;
  const pendingReq = requests.filter(r => r.status === 'pending').length;
  const docCount = documents.length;

  const summaryRows = [
    ['문치과병원 재고관리 - 월별 보고서'],
    [],
    ['보고월', monthLabel],
    ['수집 기간', periodLabel],
    [],
    ['─── ' + monthLabel + ' 출고 통계 ───'],
    ['출고 건수', monthOut.length, '건'],
    ['출고 수량', totalOutQty, '개'],
    ['출고 금액', totalOutCost, '원'],
    [],
    ['─── ' + monthLabel + ' 입고 통계 ───'],
    ['입고 건수', monthIn.length, '건'],
    ['입고 수량', totalInQty, '개'],
    [],
    ['─── 현재 재고 현황 (보고일 기준) ───'],
    ['등록 품목', inventory.length, '개'],
    ['  · 품절', outOfStock, '개'],
    ['  · 부족', lowStock, '개'],
    ['재고 평가액', totalCost, '원'],
    ['대기 중 요청', pendingReq, '건'],
    [],
    ['─── 첨부 문서 ───'],
    ['업로드 문서 수', docCount, '개']
  ];
  const wsSum = XLSX.utils.aoa_to_sheet(summaryRows);
  applyFormat(wsSum, [1], 0);
  XLSX.utils.book_append_sheet(wb, wsSum, '요약');

  // 2. 팀별 통계
  const teamMap = {};
  monthOut.forEach(h => {
    const t = h.team || '(미지정)';
    if (!teamMap[t]) teamMap[t] = { count: 0, qty: 0, cost: 0 };
    teamMap[t].count++;
    teamMap[t].qty += h.qty || 0;
    teamMap[t].cost += (h.qty || 0) * (h.price || 0);
  });
  const teamRows = [['팀명', '출고 건수', '출고 수량', '출고 금액(원)', '비율(%)']];
  Object.entries(teamMap)
    .sort((a, b) => b[1].cost - a[1].cost)
    .forEach(([t, s]) => {
      const pct = totalOutCost > 0 ? Math.round((s.cost / totalOutCost) * 1000) / 10 : 0;
      teamRows.push([t, s.count, s.qty, s.cost, pct]);
    });
  if (teamRows.length === 1) teamRows.push(['(' + monthLabel + ' 출고 없음)']);
  else teamRows.push(['합계', monthOut.length, totalOutQty, totalOutCost, 100]);
  const wsTeam = XLSX.utils.aoa_to_sheet(teamRows);
  applyFormat(wsTeam, [1, 2, 3, 4]);
  XLSX.utils.book_append_sheet(wb, wsTeam, '팀별 통계');

  // 3. 업체별 통계
  const vendorMap = {};
  monthOut.forEach(h => {
    const v = h.vendor || '(미지정)';
    if (!vendorMap[v]) vendorMap[v] = { count: 0, qty: 0, cost: 0 };
    vendorMap[v].count++;
    vendorMap[v].qty += h.qty || 0;
    vendorMap[v].cost += (h.qty || 0) * (h.price || 0);
  });
  const vendorRows = [['업체명', '출고 건수', '출고 수량', '출고 금액(원)', '비율(%)']];
  Object.entries(vendorMap)
    .sort((a, b) => b[1].cost - a[1].cost)
    .forEach(([v, s]) => {
      const pct = totalOutCost > 0 ? Math.round((s.cost / totalOutCost) * 1000) / 10 : 0;
      vendorRows.push([v, s.count, s.qty, s.cost, pct]);
    });
  if (vendorRows.length === 1) vendorRows.push(['(' + monthLabel + ' 출고 없음)']);
  else vendorRows.push(['합계', monthOut.length, totalOutQty, totalOutCost, 100]);
  const wsVendor = XLSX.utils.aoa_to_sheet(vendorRows);
  applyFormat(wsVendor, [1, 2, 3, 4]);
  XLSX.utils.book_append_sheet(wb, wsVendor, '업체별 통계');

  // 4. TOP 품목
  const itemMap = {};
  monthOut.forEach(h => {
    const k = (h.vendor || '') + '::' + (h.name || '');
    if (!itemMap[k]) itemMap[k] = { vendor: h.vendor, name: h.name, unit: h.unit, qty: 0, cost: 0 };
    itemMap[k].qty += h.qty || 0;
    itemMap[k].cost += (h.qty || 0) * (h.price || 0);
  });
  const itemRows = [['순위', '업체', '품명', '단위', '출고 수량', '출고 금액(원)']];
  Object.values(itemMap)
    .sort((a, b) => b.cost - a.cost)
    .forEach((s, i) => itemRows.push([
      i + 1, s.vendor || '', s.name || '', s.unit || '', s.qty, s.cost
    ]));
  if (itemRows.length === 1) itemRows.push(['(' + monthLabel + ' 출고 없음)']);
  const wsItem = XLSX.utils.aoa_to_sheet(itemRows);
  applyFormat(wsItem, [4, 5]);
  XLSX.utils.book_append_sheet(wb, wsItem, 'TOP 품목');

  // 5. 팀별 AI 분석 (보고월 vs 직전 3개월 평균)
  const prev3Start = new Date(year, month - 4, 1);
  const past3 = history.filter(h => {
    if (h.type !== 'out') return false;
    const d = new Date(h.date);
    return d >= prev3Start && d < monthStart;
  });
  function aggByTeamItem(arr) {
    const map = {};
    arr.forEach(h => {
      const team = h.team || '(미지정)';
      if (!map[team]) map[team] = {};
      const k = (h.vendor || '') + '::' + (h.name || '');
      if (!map[team][k]) map[team][k] = { vendor: h.vendor, name: h.name, qty: 0 };
      map[team][k].qty += h.qty || 0;
    });
    return map;
  }
  const thisByTeam = aggByTeamItem(monthOut);
  const past3ByTeam = aggByTeamItem(past3);
  const allTeams = new Set([...Object.keys(thisByTeam), ...Object.keys(past3ByTeam)]);

  const anomRows = [
    ['AI 분석: ' + monthLabel + ' vs 직전 3개월 월평균'],
    ['±30% 이상 변동 / 신규 / 중단 항목 + 팀별 자동 코멘트'],
    [],
    ['팀명', '분류', '업체', '품명', monthLabel + ' 수량', '직전 3개월 월평균', '변화율']
  ];
  let anomCount = 0;
  Array.from(allTeams).sort((a, b) => {
    const ai = teams.indexOf(a), bi = teams.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  }).forEach(team => {
    const thisItems = thisByTeam[team] || {};
    const past3Items = past3ByTeam[team] || {};
    const allKeys = new Set([...Object.keys(thisItems), ...Object.keys(past3Items)]);
    const tRows = [];
    const itemsForComment = [];
    allKeys.forEach(k => {
      const thisQty = thisItems[k] ? thisItems[k].qty : 0;
      const pastQty = past3Items[k] ? past3Items[k].qty : 0;
      const pastAvg = pastQty / 3;
      const meta = thisItems[k] || past3Items[k];
      const price = priceLookup(inventory, history, meta.vendor, meta.name);
      const costImpact = (thisQty - pastAvg) * price;
      if (pastAvg === 0 && thisQty > 0) {
        tRows.push([team, '★ 신규', meta.vendor, meta.name, thisQty, 0, '신규']);
        itemsForComment.push({ kind: 'new', name: meta.name, vendor: meta.vendor, thisQty, pastAvg, price, costImpact });
      } else if (pastAvg > 0 && thisQty === 0) {
        tRows.push([team, '⛔ 중단', meta.vendor, meta.name, 0, Math.round(pastAvg * 10) / 10, '-100%']);
        itemsForComment.push({ kind: 'gone', name: meta.name, vendor: meta.vendor, thisQty, pastAvg, price, costImpact });
      } else if (pastAvg > 0) {
        const diffPct = ((thisQty - pastAvg) / pastAvg) * 100;
        if (diffPct >= 30) {
          tRows.push([team, '▲ 급증', meta.vendor, meta.name, thisQty, Math.round(pastAvg * 10) / 10, '+' + Math.round(diffPct) + '%']);
          itemsForComment.push({ kind: 'up', name: meta.name, vendor: meta.vendor, thisQty, pastAvg, price, costImpact, diffPct });
        } else if (diffPct <= -30) {
          tRows.push([team, '▼ 감소', meta.vendor, meta.name, thisQty, Math.round(pastAvg * 10) / 10, Math.round(diffPct) + '%']);
          itemsForComment.push({ kind: 'down', name: meta.name, vendor: meta.vendor, thisQty, pastAvg, price, costImpact, diffPct });
        }
      }
    });
    if (tRows.length > 0) {
      // 팀별 코멘트 행 먼저
      const comment = generateTeamCommentText(itemsForComment);
      anomRows.push(['💬 ' + team + ' 자동 분석', comment]);
      const order = { '★ 신규': 0, '▲ 급증': 1, '▼ 감소': 2, '⛔ 중단': 3 };
      tRows.sort((a, b) => (order[a[1]] || 99) - (order[b[1]] || 99));
      tRows.forEach(r => { anomRows.push(r); anomCount++; });
      anomRows.push([]);  // 팀 사이 구분
    }
  });
  if (anomCount === 0) anomRows.push(['(특이 변동 없음)']);
  const wsAnom = XLSX.utils.aoa_to_sheet(anomRows);
  applyFormat(wsAnom, [4, 5], 3);
  XLSX.utils.book_append_sheet(wb, wsAnom, '팀별 AI 분석');

  // 6. 출고 원장 (반출자 + 숨김 마커 포함)
  const hiddenSet = buildHiddenSet(inventory);
  const ledgerRows = [['숨김', '날짜', '팀', '요청자', '반출자', '업체', '품명', '단위', '수량', '단가(원)', '금액(원)']];
  monthOut.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(h => {
    ledgerRows.push([
      isHidden(hiddenSet, h.vendor, h.name) ? '🙈' : '',
      (h.date || '').slice(0, 10), h.team || '',
      h.requester || h.member || '', h.releasedBy || '',
      h.vendor || '', h.name || '', h.unit || '',
      h.qty || 0, h.price || 0, (h.qty || 0) * (h.price || 0)
    ]);
  });
  if (ledgerRows.length === 1) ledgerRows.push(['(' + monthLabel + ' 출고 없음)']);
  const wsLedger = XLSX.utils.aoa_to_sheet(ledgerRows);
  applyFormat(wsLedger, [8, 9, 10]);  // 숨김 컬럼 추가로 인덱스 +1
  XLSX.utils.book_append_sheet(wb, wsLedger, '출고 원장');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// 직전 달 (1-based month)
function getPreviousMonth(date) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m === 1) return { year: y - 1, month: 12 };
  return { year: y, month: m - 1 };
}

// 한국식 월/주차 라벨 (KST 기준): "2026년 5월 1주차"
function getMonthWeekLabelKr(date) {
  const d = date || new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const week = Math.ceil(day / 7);
  return year + '년 ' + month + '월 ' + week + '주차';
}

// "2026년 4월"
function getMonthLabelKr(year, month) {
  return year + '년 ' + month + '월';
}

module.exports = {
  generateMonthlyReportExcel, getPreviousMonth, applyFormat,
  generateTeamCommentText, priceLookup, formatWonPlain,
  getMonthWeekLabelKr, getMonthLabelKr
};
