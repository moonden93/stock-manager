// ============================================
// 15-backup.js: 주간 자동 이메일 백업 + 백업/보고용 Excel 생성
// ============================================
// 두 종류의 Excel을 분리:
//   1) 재난백업용_YYYY-MM-DD.xlsx — 전체 데이터 덤프 (복원용, 시스템 데이터)
//   2) 보고용_YYYY-MM-DD.xlsx — 사람이 읽는 깔끔한 리포트 (의사결정용)
//
// 콘솔 함수:
//   mcDownloadRecoveryNow()  — 재난백업용 Excel 즉시 다운로드
//   mcDownloadReportNow()    — 보고용 Excel 즉시 다운로드
//   mcSendBackupNow()        — 이메일 발송 (현재 첨부 미지원)
//   mcResetBackupCooldown()  — 쿨다운/주차 기록 초기화
//   mcGetThisWeek()          — 현재 ISO 주차 확인

const FORMSUBMIT_TOKEN = '23c157956a65820f31b77fd1e87dd9c7';
const FORMSUBMIT_ENDPOINT = 'https://formsubmit.co/' + FORMSUBMIT_TOKEN;
const LAST_BACKUP_KEY = 'mc_last_backup_week';
const LAST_BACKUP_TIME_KEY = 'mc_last_backup_time';
const MIN_RESEND_MS = 5 * 60 * 1000;

// ============================================
// 시간 유틸
// ============================================
function getIsoWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getFullYear() + '-W' + String(weekNo).padStart(2, '0');
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);  // 2026-05-03
}

// ============================================
// 파일 다운로드 헬퍼
// ============================================
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// XLSX → Blob
function workbookToBlob(wb) {
  const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([arr], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

// 컬럼 너비 자동 + 숫자 포맷 헬퍼
function applyFormat(ws, numericCols, headerRowCount) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  // 숫자 컬럼 천단위 콤마
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
  // 컬럼 너비 자동
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

// ============================================
// 1) 재난백업용 Excel — 전체 데이터 덤프
// ============================================
// 시스템 복원 목적. 사람이 읽는 게 아니라 데이터를 빠짐없이 보존하는 게 목표.
// 시트: 메타, 품목, 입출고이력, 반출요청, 팀_담당자, 문서_메타, 원본_JSON
function generateRecoveryExcel() {
  if (typeof XLSX === 'undefined') throw new Error('XLSX 라이브러리 로드 안 됨');

  const wb = XLSX.utils.book_new();
  const now = new Date();
  const weekKey = getIsoWeek(now);

  // ─ 메타 ─
  const meta = [
    ['문치과병원 재고관리 - 재난복구용 백업'],
    [],
    ['주차', weekKey],
    ['추출일시', now.toLocaleString('ko-KR')],
    ['용도', '시스템 복원 (사람이 읽는 자료 아님)'],
    [],
    ['품목 수', inventory.length],
    ['이력 수', history.length],
    ['요청 수', requests.length],
    ['팀 수', teams.length],
    ['담당자 수', Object.values(teamMembers).reduce((s, m) => s + (m ? m.length : 0), 0)],
    ['문서 수', documents.length],
    [],
    ['※ 이 파일은 절대 삭제하지 말고 보관하세요. 데이터 손실 시 복원에 사용됩니다.'],
    ['※ 보고/검토용 자료는 [보고용_*.xlsx] 파일을 사용하세요.']
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), '메타');

  // ─ 품목 (전체, ID 포함) ─
  const invRows = [['ID', '업체', '품명', '단위', '단가', '재고', '부족기준', '카테고리']];
  inventory.forEach(it => invRows.push([
    it.id || '', it.vendor || '', it.name || '', it.unit || '',
    it.price || 0, it.stock || 0, it.minStock || 0, it.category || ''
  ]));
  const wsInv = XLSX.utils.aoa_to_sheet(invRows);
  applyFormat(wsInv, [4, 5, 6]);
  XLSX.utils.book_append_sheet(wb, wsInv, '품목');

  // ─ 입출고 이력 (전체) — releasedBy(반출 처리한 사람) 포함 ─
  const histRows = [['ID', '날짜', '주차', '구분', '팀', '요청자', '반출자', '업체', '품명', '단위', '수량', '단가']];
  history.forEach(h => histRows.push([
    h.id || '', h.date || '', h.weekKey || '', h.type || '',
    h.team || '', h.requester || h.member || '', h.releasedBy || '',
    h.vendor || '', h.name || '',
    h.unit || '', h.qty || 0, h.price || 0
  ]));
  const wsHist = XLSX.utils.aoa_to_sheet(histRows);
  applyFormat(wsHist, [10, 11]);
  XLSX.utils.book_append_sheet(wb, wsHist, '입출고이력');

  // ─ 반출 요청 (전체) — releasedBy 포함 ─
  const reqRows = [['ID', '요청일', '상태', '팀', '요청자', '반출자', '품목수', '메모']];
  requests.forEach(r => reqRows.push([
    r.id || '', r.date || '', r.status || '',
    r.team || '', r.requester || r.member || '',
    r.releasedBy || '',
    Array.isArray(r.items) ? r.items.length : 0,
    r.memo || ''
  ]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reqRows), '반출요청');

  // ─ 팀/담당자 ─
  const teamRows = [['팀명', '담당자', '대표 여부']];
  teams.forEach(t => {
    const members = teamMembers[t] || [];
    if (members.length === 0) {
      teamRows.push([t, '(없음)', '']);
    } else {
      members.forEach((m, i) => teamRows.push([t, m, i === 0 ? '대표' : '']));
    }
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(teamRows), '팀_담당자');

  // ─ 문서 메타 (실제 파일은 제외) ─
  const docRows = [['ID', '업체', '파일명', '타입', '크기(byte)', '업로드일']];
  documents.forEach(d => docRows.push([
    d.id || '', d.vendor || '', d.name || '',
    d.type || '', d.size || 0, d.uploadedAt || ''
  ]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(docRows), '문서_메타');

  // ─ 원본 JSON (복원용 텍스트 덤프, 32KB 청크 분할) ─
  const docsLite = documents.map(d => ({
    id: d.id, vendor: d.vendor, name: d.name,
    type: d.type, size: d.size, uploadedAt: d.uploadedAt
  }));
  const fullJson = JSON.stringify({
    version: 1, weekKey, extractedAt: now.toISOString(),
    inventory, history, requests, teams, teamMembers, documents: docsLite
  });
  const CHUNK = 30000;
  const jsonRows = [['JSON 청크 (모두 이어붙여 사용)'], []];
  for (let i = 0; i < fullJson.length; i += CHUNK) {
    jsonRows.push([fullJson.slice(i, i + CHUNK)]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(jsonRows), '원본_JSON');

  return workbookToBlob(wb);
}

// ============================================
// 2) 보고용 Excel — 사람이 읽는 리포트
// ============================================
// 4개 시트:
//   1. 요약 — 현재 재고 + 이번 주 활동 + 전주 대비 변화
//   2. 품목 — 전주 대비 재고 변화 (★신규 / ▲증가 / ▼감소) 표시, 변화 있는 항목 위로
//   3. 입출고+요청 — 이번 주 입출고 + 대기 요청을 한 시트에
//   4. 팀별 AI 분석 — 이번 달 vs 지난 3개월 평균, ±30% 이상/신규/중단
//
// "전주 대비" 비교는 localStorage에 직전 보고 시점 inventory 스냅샷을 저장해서 비교.
const REPORT_INVENTORY_SNAPSHOT_KEY = 'mc_report_inv_snapshot';

function getInventorySnapshot() {
  const raw = localStorage.getItem(REPORT_INVENTORY_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return obj && obj.snapshot ? obj : null;
  } catch (e) { return null; }
}

function saveInventorySnapshot() {
  const snapshot = {};
  inventory.forEach(it => { snapshot[it.id] = it.stock || 0; });
  localStorage.setItem(REPORT_INVENTORY_SNAPSHOT_KEY, JSON.stringify({
    weekKey: getIsoWeek(new Date()),
    savedAt: new Date().toISOString(),
    snapshot
  }));
}

function generateReportExcel() {
  if (typeof XLSX === 'undefined') throw new Error('XLSX 라이브러리 로드 안 됨');

  const wb = XLSX.utils.book_new();
  const now = new Date();
  const weekKey = getIsoWeek(now);
  const prevSnap = getInventorySnapshot();

  // 공통 카운트
  const totalCost = inventory.reduce((s, it) => s + (it.stock || 0) * (it.price || 0), 0);
  const lowStock = inventory.filter(it => it.stock > 0 && it.stock <= it.minStock).length;
  const outOfStock = inventory.filter(it => it.stock === 0).length;
  const pendingReq = requests.filter(r => r.status === 'pending').length;
  const thisOutHist = history.filter(h => h.type === 'out' && h.weekKey === weekKey);
  const thisInHist  = history.filter(h => h.type === 'in'  && h.weekKey === weekKey);
  const thisOutQty = thisOutHist.reduce((s, h) => s + (h.qty || 0), 0);
  const thisOutCost = thisOutHist.reduce((s, h) => s + (h.qty || 0) * (h.price || 0), 0);
  const thisInQty = thisInHist.reduce((s, h) => s + (h.qty || 0), 0);

  // 전주 대비 변화 카운트 (요약용)
  let changedCount = 0, newCount = 0;
  if (prevSnap) {
    inventory.forEach(it => {
      const prev = prevSnap.snapshot[it.id];
      if (prev === undefined) newCount++;
      else if (prev !== (it.stock || 0)) changedCount++;
    });
  }

  // ─── 시트 1: 요약 ───
  const summaryRows = [
    ['문치과병원 재고관리 - 주간 보고서'],
    [],
    ['보고 주차', weekKey],
    ['발행일', todayDateStr()],
    [],
    ['─── 현재 재고 현황 ───'],
    ['등록 품목', inventory.length, '개'],
    ['  · 품절', outOfStock, '개'],
    ['  · 부족', lowStock, '개'],
    ['재고 평가액', totalCost, '원'],
    [],
    ['─── 이번 주 활동 ───'],
    ['출고 건수', thisOutHist.length, '건'],
    ['출고 수량', thisOutQty, '개'],
    ['출고 금액', thisOutCost, '원'],
    ['입고 건수', thisInHist.length, '건'],
    ['입고 수량', thisInQty, '개'],
    ['대기 요청', pendingReq, '건'],
    [],
    ['─── 전주 대비 ───']
  ];
  if (prevSnap) {
    summaryRows.push(['비교 기준 주차', prevSnap.weekKey]);
    summaryRows.push(['재고 변동 품목', changedCount, '개']);
    summaryRows.push(['신규 등록 품목', newCount, '개']);
  } else {
    summaryRows.push(['(첫 보고서 — 비교할 이전 스냅샷 없음)']);
  }
  const wsSum = XLSX.utils.aoa_to_sheet(summaryRows);
  applyFormat(wsSum, [1], 0);
  XLSX.utils.book_append_sheet(wb, wsSum, '요약');

  // ─── 시트 2: 품목 (전주 대비 변화 표시) ───
  // 변화 마커: ★ 신규, ▲N 증가(N개), ▼N 감소(N개), - 변화 없음, ? 비교 불가
  // 정렬: 변화 있는 항목(★, ▲, ▼) 위 → 변화 없는 항목 아래
  function classifyChange(it) {
    if (!prevSnap) return { rank: 99, marker: '?', delta: '' };
    const prev = prevSnap.snapshot[it.id];
    if (prev === undefined) return { rank: 0, marker: '★ 신규', delta: '' };
    const cur = it.stock || 0;
    const diff = cur - prev;
    if (diff > 0)  return { rank: 1, marker: '▲ +' + diff, delta: '+' + diff };
    if (diff < 0)  return { rank: 2, marker: '▼ ' + diff,  delta: String(diff) };
    return { rank: 3, marker: '-', delta: '0' };
  }

  const invWithChange = inventory.map(it => ({ it, change: classifyChange(it) }));
  invWithChange.sort((a, b) => {
    if (a.change.rank !== b.change.rank) return a.change.rank - b.change.rank;
    // 동일 rank 안에선 상태(품절/부족/정상) 우선
    const sA = a.it.stock === 0 ? 0 : (a.it.stock <= a.it.minStock ? 1 : 2);
    const sB = b.it.stock === 0 ? 0 : (b.it.stock <= b.it.minStock ? 1 : 2);
    if (sA !== sB) return sA - sB;
    return (a.it.vendor || '').localeCompare(b.it.vendor || '') ||
           (a.it.name || '').localeCompare(b.it.name || '');
  });

  const invRows = [['변화', '상태', '업체', '품명', '단위', '단가(원)', '현재 재고', '전주 재고', '부족기준']];
  invWithChange.forEach(({ it, change }) => {
    const status = it.stock === 0 ? '품절'
                 : (it.stock <= it.minStock ? '부족' : '정상');
    const prevStock = prevSnap ? (prevSnap.snapshot[it.id] !== undefined ? prevSnap.snapshot[it.id] : '-') : '-';
    invRows.push([
      change.marker, status, it.vendor || '', it.name || '', it.unit || '',
      it.price || 0, it.stock || 0, prevStock, it.minStock || 0
    ]);
  });
  const wsInv2 = XLSX.utils.aoa_to_sheet(invRows);
  applyFormat(wsInv2, [5, 6, 7, 8]);
  XLSX.utils.book_append_sheet(wb, wsInv2, '품목');

  // ─── 시트 3: 입출고이력 + 반출요청 (한 시트) ───
  const combined = [];
  combined.push(['【 이번 주 출고 】 ' + thisOutHist.length + '건 · ' + thisOutCost.toLocaleString() + '원']);
  combined.push(['날짜', '팀', '요청자', '반출자', '업체', '품명', '단위', '수량', '단가(원)', '금액(원)']);
  if (thisOutHist.length === 0) {
    combined.push(['(이번 주 출고 없음)']);
  } else {
    thisOutHist
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .forEach(h => combined.push([
        (h.date || '').slice(0, 10), h.team || '',
        h.requester || h.member || '', h.releasedBy || '',
        h.vendor || '', h.name || '', h.unit || '',
        h.qty || 0, h.price || 0, (h.qty || 0) * (h.price || 0)
      ]));
  }
  combined.push([]);
  combined.push(['【 이번 주 입고 】 ' + thisInHist.length + '건']);
  combined.push(['날짜', '업체', '품명', '단위', '수량', '단가(원)']);
  if (thisInHist.length === 0) {
    combined.push(['(이번 주 입고 없음)']);
  } else {
    thisInHist
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .forEach(h => combined.push([
        (h.date || '').slice(0, 10), h.vendor || '', h.name || '',
        h.unit || '', h.qty || 0, h.price || 0
      ]));
  }
  combined.push([]);
  combined.push(['【 대기 중 요청 】 ' + pendingReq + '건']);
  combined.push(['요청일', '팀', '담당자', '품목 수', '품목 요약', '메모']);
  const pendingList = requests
    .filter(r => r.status === 'pending')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (pendingList.length === 0) {
    combined.push(['(대기 중인 요청 없음)']);
  } else {
    pendingList.forEach(r => {
      const items = Array.isArray(r.items) ? r.items : [];
      const summary = items.slice(0, 3).map(it => it.name || '').join(', ')
                    + (items.length > 3 ? ' 외 ' + (items.length - 3) + '건' : '');
      combined.push([
        (r.date || '').slice(0, 10), r.team || '', r.member || '',
        items.length, summary, r.memo || ''
      ]);
    });
  }
  const wsCombined = XLSX.utils.aoa_to_sheet(combined);
  XLSX.utils.book_append_sheet(wb, wsCombined, '입출고+요청');

  // ─── 시트 4: 팀별 AI 분석 (이번 달 vs 지난 3개월 평균) ───
  // 11-stats.js의 이상치 로직 포팅: 팀별 + 품목별 집계, ±30%/신규/중단 분류
  const tmStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const t3Start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const outHist = history.filter(h => h.type === 'out' && !h.cancelled);
  const thisMonth = outHist.filter(h => new Date(h.date) >= tmStart);
  const past3 = outHist.filter(h => {
    const d = new Date(h.date);
    return d >= t3Start && d < tmStart;
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
  const thisByTeam = aggByTeamItem(thisMonth);
  const past3ByTeam = aggByTeamItem(past3);
  const allTeams = new Set([...Object.keys(thisByTeam), ...Object.keys(past3ByTeam)]);
  const monthLabel = tmStart.getFullYear() + '년 ' + (tmStart.getMonth() + 1) + '월';

  const anomRows = [
    ['AI 분석: ' + monthLabel + ' vs 지난 3개월 월평균 (±30% 이상 변동, 신규/중단)'],
    [],
    ['팀명', '분류', '업체', '품명', monthLabel + ' 수량', '지난 3개월 월평균', '변화율']
  ];
  let anomCount = 0;
  Array.from(allTeams)
    .sort((a, b) => {
      const ai = teams.indexOf(a), bi = teams.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .forEach(team => {
      const thisItems = thisByTeam[team] || {};
      const past3Items = past3ByTeam[team] || {};
      const allKeys = new Set([...Object.keys(thisItems), ...Object.keys(past3Items)]);
      const teamRows = [];
      allKeys.forEach(k => {
        const thisQty = thisItems[k] ? thisItems[k].qty : 0;
        const pastQty = past3Items[k] ? past3Items[k].qty : 0;
        const pastAvg = pastQty / 3;
        const meta = thisItems[k] || past3Items[k];
        if (pastAvg === 0 && thisQty > 0) {
          teamRows.push([team, '★ 신규', meta.vendor, meta.name, thisQty, 0, '신규']);
        } else if (pastAvg > 0 && thisQty === 0) {
          teamRows.push([team, '⛔ 중단', meta.vendor, meta.name, 0, Math.round(pastAvg * 10) / 10, '-100%']);
        } else if (pastAvg > 0) {
          const diffPct = ((thisQty - pastAvg) / pastAvg) * 100;
          if (diffPct >= 30) teamRows.push([team, '▲ 급증', meta.vendor, meta.name, thisQty, Math.round(pastAvg * 10) / 10, '+' + Math.round(diffPct) + '%']);
          else if (diffPct <= -30) teamRows.push([team, '▼ 감소', meta.vendor, meta.name, thisQty, Math.round(pastAvg * 10) / 10, Math.round(diffPct) + '%']);
        }
      });
      // 분류 우선순위: 신규 → 급증 → 감소 → 중단
      const order = { '★ 신규': 0, '▲ 급증': 1, '▼ 감소': 2, '⛔ 중단': 3 };
      teamRows.sort((a, b) => (order[a[1]] || 99) - (order[b[1]] || 99));
      teamRows.forEach(r => { anomRows.push(r); anomCount++; });
    });

  if (anomCount === 0) {
    anomRows.push(['(특이 변동 없음 — 모든 팀이 평소 사용 패턴)']);
  }
  const wsAnom = XLSX.utils.aoa_to_sheet(anomRows);
  applyFormat(wsAnom, [4, 5], 2);
  XLSX.utils.book_append_sheet(wb, wsAnom, '팀별 AI 분석');

  // 다음 주 비교를 위해 현재 inventory 스냅샷 저장
  saveInventorySnapshot();

  return workbookToBlob(wb);
}

// ============================================
// 주간 자동 이메일 백업 (현재는 본문만, 첨부 미지원)
// ============================================
async function tryWeeklyBackup(force) {
  if (!window.firebaseReady) return;
  if (!Array.isArray(inventory) || inventory.length === 0) return;

  const thisWeek = getIsoWeek(new Date());
  const lastSent = localStorage.getItem(LAST_BACKUP_KEY);
  if (!force && lastSent === thisWeek) {
    console.log('📧 이번 주(' + thisWeek + ') 백업 이미 발송됨 — 건너뜀');
    return;
  }

  const lastTime = parseInt(localStorage.getItem(LAST_BACKUP_TIME_KEY) || '0', 10);
  const elapsed = Date.now() - lastTime;
  if (elapsed < MIN_RESEND_MS) {
    const wait = Math.ceil((MIN_RESEND_MS - elapsed) / 1000);
    console.log('⏱️ 너무 빨리 재발송 — ' + wait + '초 후 다시 시도하세요');
    return;
  }

  try {
    console.log('📧 주간 백업 발송 시작 (' + thisWeek + ')');
    localStorage.setItem(LAST_BACKUP_TIME_KEY, String(Date.now()));
    await sendBackupEmail(thisWeek);
    localStorage.setItem(LAST_BACKUP_KEY, thisWeek);
    console.log('✅ 주간 백업 발송 요청 완료');
  } catch (err) {
    console.error('❌ 주간 백업 실패:', err);
  }
}

async function sendBackupEmail(weekKey) {
  const totalCost = inventory.reduce((s, it) => s + (it.stock || 0) * (it.price || 0), 0);
  const lowStock = inventory.filter(it => it.stock > 0 && it.stock <= it.minStock).length;
  const outOfStock = inventory.filter(it => it.stock === 0).length;
  const pendingReq = requests.filter(r => r.status === 'pending').length;
  const thisOutHist = history.filter(h => h.type === 'out' && h.weekKey === weekKey);
  const thisOutQty = thisOutHist.reduce((s, h) => s + (h.qty || 0), 0);
  const thisOutCost = thisOutHist.reduce((s, h) => s + (h.qty || 0) * (h.price || 0), 0);

  const message = [
    '문치과병원 재고관리 - 주간 보고',
    '═══════════════════════════════════════',
    '',
    '주차: ' + weekKey,
    '발송일: ' + todayDateStr(),
    '',
    '【 현재 재고 현황 】',
    '· 등록 품목: ' + inventory.length + '개 (품절 ' + outOfStock + ', 부족 ' + lowStock + ')',
    '· 재고 평가액: ' + totalCost.toLocaleString() + '원',
    '· 대기 중 요청: ' + pendingReq + '건',
    '',
    '【 이번 주 출고 】',
    '· 건수: ' + thisOutHist.length + '건',
    '· 수량: ' + thisOutQty + '개',
    '· 금액: ' + thisOutCost.toLocaleString() + '원',
    '',
    '※ 본 메일은 매주 자동 발송됩니다.',
    '※ 상세 데이터는 사이트 콘솔에서 다음 명령으로 다운로드 가능:',
    '   - mcDownloadReportNow()    : 보고용 Excel',
    '   - mcDownloadRecoveryNow()  : 재난복구용 Excel'
  ].join('\n');

  const fields = {
    _subject: '[재고관리] 주간 보고 ' + weekKey,
    _captcha: 'false',
    _template: 'box',
    name: '재고관리 자동백업',
    email: 'backup@moondental.local',
    message: message
  };
  // 본문만 — 첨부는 FormSubmit 무료 미지원으로 보류
  await submitFormBodyOnly(FORMSUBMIT_ENDPOINT, fields);
}

// 본문만 보내는 form 제출 (no-cors 모드)
async function submitFormBodyOnly(url, fields) {
  const formData = new FormData();
  Object.keys(fields).forEach(k => formData.append(k, fields[k]));
  await fetch(url, { method: 'POST', body: formData, mode: 'no-cors' });
}

// ============================================
// 3) 월별보고용 Excel — 한 달 단위 집계 리포트
// ============================================
// 매월 1일에 전월 데이터로 발송 (예: 5/1에 4월 보고서)
// 시트: 요약, 팀별 통계, 업체별 통계, TOP 품목, 이상치, 출고 원장
function generateMonthlyReportExcel(year, month) {
  if (typeof XLSX === 'undefined') throw new Error('XLSX 라이브러리 로드 안 됨');

  const wb = XLSX.utils.book_new();
  const yearMonth = year + '-' + String(month).padStart(2, '0');

  // 해당 월의 시작/끝 (Date 객체)
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);  // 다음 달 1일 (exclusive)
  const monthLabel = year + '년 ' + month + '월';
  const periodLabel = year + '-' + String(month).padStart(2, '0') + '-01 ~ ' +
                      year + '-' + String(month).padStart(2, '0') + '-' +
                      String(new Date(year, month, 0).getDate()).padStart(2, '0');

  // 해당 월의 출고/입고 필터
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

  // ─── 시트 1: 요약 ───
  const totalCost = inventory.reduce((s, it) => s + (it.stock || 0) * (it.price || 0), 0);
  const lowStock = inventory.filter(it => it.stock > 0 && it.stock <= it.minStock).length;
  const outOfStock = inventory.filter(it => it.stock === 0).length;
  const pendingReq = requests.filter(r => r.status === 'pending').length;
  const docCount = documents.length;

  const summaryRows = [
    ['문치과병원 재고관리 - 월별 보고서'],
    [],
    ['보고월', monthLabel],
    ['발행일 (KST)', todayDateStr()],
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

  // ─── 시트 2: 팀별 사용량 ───
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

  // ─── 시트 3: 업체별 사용량 ───
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

  // ─── 시트 4: TOP 품목 ───
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

  // ─── 시트 5: 이상치 (보고월 vs 직전 3개월 평균) ───
  const prev3Start = new Date(year, month - 4, 1);
  const prev3End = monthStart;
  const past3 = history.filter(h => {
    if (h.type !== 'out') return false;
    const d = new Date(h.date);
    return d >= prev3Start && d < prev3End;
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
    ['AI 분석: ' + monthLabel + ' vs 직전 3개월(' +
     (year + '-' + String(month - 3).padStart(2, '0')) + ' ~ ' +
     (year + '-' + String(month - 1).padStart(2, '0')) + ') 월평균'],
    ['±30% 이상 변동 / 신규 / 중단 항목만 표시'],
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
    allKeys.forEach(k => {
      const thisQty = thisItems[k] ? thisItems[k].qty : 0;
      const pastQty = past3Items[k] ? past3Items[k].qty : 0;
      const pastAvg = pastQty / 3;
      const meta = thisItems[k] || past3Items[k];
      if (pastAvg === 0 && thisQty > 0) {
        tRows.push([team, '★ 신규', meta.vendor, meta.name, thisQty, 0, '신규']);
      } else if (pastAvg > 0 && thisQty === 0) {
        tRows.push([team, '⛔ 중단', meta.vendor, meta.name, 0, Math.round(pastAvg * 10) / 10, '-100%']);
      } else if (pastAvg > 0) {
        const diffPct = ((thisQty - pastAvg) / pastAvg) * 100;
        if (diffPct >= 30) tRows.push([team, '▲ 급증', meta.vendor, meta.name, thisQty, Math.round(pastAvg * 10) / 10, '+' + Math.round(diffPct) + '%']);
        else if (diffPct <= -30) tRows.push([team, '▼ 감소', meta.vendor, meta.name, thisQty, Math.round(pastAvg * 10) / 10, Math.round(diffPct) + '%']);
      }
    });
    const order = { '★ 신규': 0, '▲ 급증': 1, '▼ 감소': 2, '⛔ 중단': 3 };
    tRows.sort((a, b) => (order[a[1]] || 99) - (order[b[1]] || 99));
    tRows.forEach(r => { anomRows.push(r); anomCount++; });
  });
  if (anomCount === 0) anomRows.push(['(특이 변동 없음 — 모든 팀이 평소 사용 패턴)']);
  const wsAnom = XLSX.utils.aoa_to_sheet(anomRows);
  applyFormat(wsAnom, [4, 5], 3);
  XLSX.utils.book_append_sheet(wb, wsAnom, '팀별 AI 분석');

  // ─── 시트 6: 출고 원장 (반출자 포함) ───
  const ledgerRows = [['날짜', '팀', '요청자', '반출자', '업체', '품명', '단위', '수량', '단가(원)', '금액(원)']];
  monthOut
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .forEach(h => ledgerRows.push([
      (h.date || '').slice(0, 10), h.team || '',
      h.requester || h.member || '', h.releasedBy || '',
      h.vendor || '', h.name || '', h.unit || '',
      h.qty || 0, h.price || 0, (h.qty || 0) * (h.price || 0)
    ]));
  if (ledgerRows.length === 1) ledgerRows.push(['(' + monthLabel + ' 출고 없음)']);
  const wsLedger = XLSX.utils.aoa_to_sheet(ledgerRows);
  applyFormat(wsLedger, [7, 8, 9]);
  XLSX.utils.book_append_sheet(wb, wsLedger, '출고 원장');

  return workbookToBlob(wb);
}

// 직전 달 (year, month) — 1-based month
function getPreviousMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;  // 1-based
  if (m === 1) return { year: y - 1, month: 12 };
  return { year: y, month: m - 1 };
}

// ============================================
// 콘솔 함수
// ============================================
if (typeof window !== 'undefined') {
  window.mcGetThisWeek = function() { return getIsoWeek(new Date()); };

  // 한국식 주차 라벨 ("2026년 5월 1주차")
  function _monthWeekLabelKr(d) {
    const dt = d || new Date();
    const week = Math.ceil(dt.getDate() / 7);
    return dt.getFullYear() + '년 ' + (dt.getMonth() + 1) + '월 ' + week + '주차';
  }

  window.mcDownloadRecoveryNow = function() {
    const blob = generateRecoveryExcel();
    const filename = '재난백업용_' + _monthWeekLabelKr() + '.xlsx';
    downloadBlob(filename, blob);
    console.log('📥 재난백업용 다운로드: ' + filename);
  };

  window.mcDownloadReportNow = function() {
    const blob = generateReportExcel();
    const filename = '주차별보고_' + _monthWeekLabelKr() + '.xlsx';
    downloadBlob(filename, blob);
    console.log('📥 주차별보고 다운로드: ' + filename);
  };

  // 월별 보고서 다운로드. 인자 안 주면 직전 달.
  window.mcDownloadMonthlyReportNow = function(yearMonth) {
    let year, month;
    if (yearMonth) {
      const parts = yearMonth.split('-');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      if (!year || !month || month < 1 || month > 12) {
        console.error('형식 오류. 예: mcDownloadMonthlyReportNow("2026-04")');
        return;
      }
    } else {
      const prev = getPreviousMonth();
      year = prev.year;
      month = prev.month;
    }
    const blob = generateMonthlyReportExcel(year, month);
    const filename = '월별보고_' + year + '년 ' + month + '월.xlsx';
    downloadBlob(filename, blob);
    console.log('📥 월별보고 다운로드: ' + filename);
  };

  window.mcSendBackupNow = async function() { await tryWeeklyBackup(true); };

  window.mcResetBackupCooldown = function() {
    localStorage.removeItem(LAST_BACKUP_KEY);
    localStorage.removeItem(LAST_BACKUP_TIME_KEY);
    console.log('🧹 백업 쿨다운/주차 기록 초기화');
  };

  // ⚠️ 위험 함수 잠금 — 콘솔에서 누구나 wipe하지 못하게 unlock token 필요
  // 사용 예: mcUnlockDanger('잘못 누르면 모두 다 사라짐을 이해합니다')
  function _isUnlocked() {
    return window._dangerUnlocked === true;
  }
  window.mcUnlockDanger = function(phrase) {
    if (phrase === '잘못 누르면 모두 다 사라짐을 이해합니다') {
      window._dangerUnlocked = true;
      console.log('🔓 위험 함수 잠금 해제됨 (이 세션 한정). 5분 후 자동 재잠금.');
      setTimeout(() => { window._dangerUnlocked = false; console.log('🔒 위험 함수 자동 재잠금'); }, 5 * 60 * 1000);
    } else {
      console.error('잘못된 phrase. 정확한 문구를 입력해주세요.');
    }
  };

  // 시트 데이터(PREBUILT_HISTORY)를 history로 강제 재import.
  window.mcReimportFromSheets = function() {
    if (!_isUnlocked()) {
      console.error('🔒 잠금됨. 먼저 mcUnlockDanger("잘못 누르면 모두 다 사라짐을 이해합니다") 실행');
      return;
    }
    if (typeof PREBUILT_HISTORY === 'undefined') {
      console.error('PREBUILT_HISTORY 로드 안 됨 — 페이지 새로고침 후 재시도');
      return;
    }
    const oldCount = history.length;
    const newCount = PREBUILT_HISTORY.length;
    if (!confirm('history를 시트 데이터로 교체합니다.\n\n현재: ' + oldCount + '건\n신규: ' + newCount + '건\n\n계속하시겠습니까?')) {
      console.log('취소됨');
      return;
    }
    if (typeof logEvent === 'function') logEvent('system', 'mass_replace', { summary: 'history 시트 데이터 교체', before: oldCount, after: newCount });
    window._allowMassDecrease = true;  // 의도된 대량 변경
    history.length = 0;
    PREBUILT_HISTORY.forEach(h => history.push(h));
    saveAll();
    if (typeof updateHeaderStats === 'function') updateHeaderStats();
    if (typeof switchTab === 'function') switchTab(currentTab);
    console.log('✓ history 교체 완료: ' + oldCount + ' → ' + newCount + '건 (Firestore에도 반영)');
  };

  // 반출 기록만 시트 데이터로 리셋 (담당자/품목 설정은 보존).
  // - history: 시트 1481건으로 교체 (테스트로 처리한 5월 기록 제거)
  // - requests: 비움 (테스트 요청 제거)
  // ⚠️ inventory는 유지 (사용자 설정 보존)
  // ⚠️ teamMembers는 유지 (사용자 설정 보존)
  // ⚠️ teams는 유지 (사용자 설정 보존)
  window.mcResetToSheetData = function() {
    if (!_isUnlocked()) {
      console.error('🔒 잠금됨. 먼저 mcUnlockDanger("잘못 누르면 모두 다 사라짐을 이해합니다") 실행');
      return;
    }
    if (typeof PREBUILT_HISTORY === 'undefined') {
      console.error('PREBUILT_HISTORY 로드 안 됨 — 페이지 새로고침 후 재시도');
      return;
    }
    window._allowMassDecrease = true;  // 의도된 대량 변경
    if (typeof logEvent === 'function') logEvent('system', 'mass_reset', { summary: 'mcResetToSheetData 실행' });
    const summary = '【 반출 기록을 시트 데이터로 리셋 】\n\n' +
      '이력:    ' + history.length + '건 → ' + PREBUILT_HISTORY.length + '건\n' +
      '요청:    ' + requests.length + '건 → 0건 (전부 삭제)\n\n' +
      '【 보존됨 (변경 없음) 】\n' +
      '품목:    ' + inventory.length + '개\n' +
      '팀:      ' + teams.length + '개\n' +
      '담당자:  ' + Object.keys(teamMembers).length + '팀의 ' +
        Object.values(teamMembers).reduce((s, m) => s + (m ? m.length : 0), 0) + '명\n\n' +
      '계속하시겠습니까?';
    if (!confirm(summary)) {
      console.log('취소됨');
      return;
    }
    history.length = 0;
    PREBUILT_HISTORY.forEach(h => history.push(h));
    requests.length = 0;
    saveAll();
    if (typeof updateHeaderStats === 'function') updateHeaderStats();
    if (typeof switchTab === 'function') switchTab(currentTab);
    console.log('✓ 반출 기록 리셋 완료. 새로고침 권장.');
  };
}
