// ============================================
// weekly-backup.js: 매주 토요일 12시(KST) GitHub Actions로 실행
// ============================================
// 1) Firestore에서 appData/main 읽기 (REST, 익명 접근 가능 가정)
// 2) 보고용 Excel + 재난백업용 Excel 생성
// 3) Gmail SMTP로 첨부파일 메일 발송
//
// 참고: 문서 첨부파일(PDF/이미지 등)은 메일 용량 한도 때문에 미포함.
//       Apps Script 백업의 Drive 폴더에서 별도 동기화됨.
//
// 환경변수 (GitHub Secrets):
//   GMAIL_USER          — 보내는 Gmail 주소 (앱 비밀번호 발급한 계정)
//   GMAIL_APP_PASSWORD  — Gmail 앱 비밀번호 (16자리, 일반 비번 아님)
//   BACKUP_RECIPIENT    — 받는 사람 이메일 (없으면 GMAIL_USER로 보냄)

const XLSX = require('xlsx');
const nodemailer = require('nodemailer');

const PROJECT_ID = 'moon-dental-stock';
const DOC_PATH = 'appData/main';

async function main() {
  console.log('🌙 Daily backup starting at', new Date().toISOString());

  const data = await fetchFirestore();
  console.log('✓ Fetched data:', {
    inventory: (data.inventory || []).length,
    history: (data.history || []).length,
    requests: (data.requests || []).length,
    teams: (data.teams || []).length
  });

  if (!Array.isArray(data.inventory) || data.inventory.length === 0) {
    throw new Error('Firestore inventory가 비어있음 — 백업 중단 (데이터 보호)');
  }

  const today = todayKstStr();
  const recoveryBuf = generateRecoveryExcel(data);
  const reportBuf = generateReportExcel(data);
  console.log('✓ Generated Excel files');

  await sendEmail(data, today, [
    { filename: '보고용_' + today + '.xlsx', content: reportBuf },
    { filename: '재난백업용_' + today + '.xlsx', content: recoveryBuf }
  ]);
  console.log('✓ Email sent');
}

// ============================================
// Firestore REST + 타입 파서
// ============================================
async function fetchFirestore() {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${DOC_PATH}`;
  const r = await fetch(url);
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error('Firestore fetch ' + r.status + ': ' + text.slice(0, 300));
  }
  const json = await r.json();
  return parseFirestoreDoc(json.fields || {});
}

function parseFirestoreDoc(fields) {
  const out = {};
  for (const key of Object.keys(fields)) {
    out[key] = parseFirestoreValue(fields[key]);
  }
  return out;
}

function parseFirestoreValue(v) {
  if (v === null || v === undefined) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) {
    return (v.arrayValue.values || []).map(parseFirestoreValue);
  }
  if ('mapValue' in v) {
    return parseFirestoreDoc(v.mapValue.fields || {});
  }
  return null;
}

// ============================================
// 시간 유틸 (KST 기준)
// ============================================
function todayKstStr() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function getIsoWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getFullYear() + '-W' + String(weekNo).padStart(2, '0');
}

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

// ============================================
// 1) 재난백업용 Excel
// ============================================
function generateRecoveryExcel(data) {
  const inventory = data.inventory || [];
  const history = data.history || [];
  const requests = data.requests || [];
  const teams = data.teams || [];
  const teamMembers = data.teamMembers || {};
  const documents = data.documents || [];

  const wb = XLSX.utils.book_new();
  const now = new Date();
  const weekKey = getIsoWeek(now);
  const today = todayKstStr();

  // 메타
  const meta = [
    ['문치과병원 재고관리 - 재난복구용 백업'],
    [],
    ['주차', weekKey],
    ['추출일 (KST)', today],
    ['용도', '시스템 복원 (사람이 읽는 자료 아님)'],
    [],
    ['품목 수', inventory.length],
    ['이력 수', history.length],
    ['요청 수', requests.length],
    ['팀 수', teams.length],
    ['담당자 수', Object.values(teamMembers).reduce((s, m) => s + (Array.isArray(m) ? m.length : 0), 0)],
    ['문서 수', documents.length]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), '메타');

  // 품목
  const invRows = [['ID', '업체', '품명', '단위', '단가', '재고', '부족기준', '카테고리']];
  inventory.forEach(it => invRows.push([
    it.id || '', it.vendor || '', it.name || '', it.unit || '',
    it.price || 0, it.stock || 0, it.minStock || 0, it.category || ''
  ]));
  const wsInv = XLSX.utils.aoa_to_sheet(invRows);
  applyFormat(wsInv, [4, 5, 6]);
  XLSX.utils.book_append_sheet(wb, wsInv, '품목');

  // 입출고이력 (releasedBy 포함)
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

  // 반출요청 (releasedBy 포함)
  const reqRows = [['ID', '요청일', '상태', '팀', '요청자', '반출자', '품목수', '메모']];
  requests.forEach(r => reqRows.push([
    r.id || '', r.date || '', r.status || '',
    r.team || '', r.requester || r.member || '',
    r.releasedBy || '',
    Array.isArray(r.items) ? r.items.length : 0,
    r.memo || ''
  ]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reqRows), '반출요청');

  // 팀_담당자
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

  // 문서_메타
  const docRows = [['ID', '업체', '파일명', '타입', '크기(byte)', '업로드일']];
  documents.forEach(d => docRows.push([
    d.id || '', d.vendor || '', d.name || '',
    d.type || '', d.size || 0, d.uploadedAt || ''
  ]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(docRows), '문서_메타');

  // 원본_JSON (복원용 텍스트 덤프)
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

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ============================================
// 2) 보고용 Excel
// ============================================
function generateReportExcel(data) {
  const inventory = data.inventory || [];
  const history = data.history || [];
  const requests = data.requests || [];
  const teams = data.teams || [];

  const wb = XLSX.utils.book_new();
  const now = new Date();
  const weekKey = getIsoWeek(now);
  const today = todayKstStr();

  const totalCost = inventory.reduce((s, it) => s + (it.stock || 0) * (it.price || 0), 0);
  const lowStock = inventory.filter(it => it.stock > 0 && it.stock <= it.minStock).length;
  const outOfStock = inventory.filter(it => it.stock === 0).length;
  const pendingReq = requests.filter(r => r.status === 'pending').length;
  const thisOutHist = history.filter(h => h.type === 'out' && h.weekKey === weekKey);
  const thisInHist  = history.filter(h => h.type === 'in'  && h.weekKey === weekKey);
  const thisOutQty = thisOutHist.reduce((s, h) => s + (h.qty || 0), 0);
  const thisOutCost = thisOutHist.reduce((s, h) => s + (h.qty || 0) * (h.price || 0), 0);
  const thisInQty = thisInHist.reduce((s, h) => s + (h.qty || 0), 0);

  // 1. 요약
  const summary = [
    ['문치과병원 재고관리 - 주간 보고서'],
    [],
    ['보고일 (KST)', today],
    ['주차', weekKey],
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
    ['대기 요청', pendingReq, '건']
  ];
  const wsSum = XLSX.utils.aoa_to_sheet(summary);
  applyFormat(wsSum, [1], 0);
  XLSX.utils.book_append_sheet(wb, wsSum, '요약');

  // 2. 품목 (상태순 정렬: 품절 → 부족 → 정상)
  const invSorted = inventory.slice().sort((a, b) => {
    const sA = a.stock === 0 ? 0 : (a.stock <= a.minStock ? 1 : 2);
    const sB = b.stock === 0 ? 0 : (b.stock <= b.minStock ? 1 : 2);
    if (sA !== sB) return sA - sB;
    return (a.vendor || '').localeCompare(b.vendor || '') || (a.name || '').localeCompare(b.name || '');
  });
  const invRows = [['상태', '업체', '품명', '단위', '단가(원)', '현재 재고', '부족기준']];
  invSorted.forEach(it => {
    const status = it.stock === 0 ? '품절'
                 : (it.stock <= it.minStock ? '부족' : '정상');
    invRows.push([status, it.vendor || '', it.name || '', it.unit || '',
                  it.price || 0, it.stock || 0, it.minStock || 0]);
  });
  const wsInv2 = XLSX.utils.aoa_to_sheet(invRows);
  applyFormat(wsInv2, [4, 5, 6]);
  XLSX.utils.book_append_sheet(wb, wsInv2, '품목');

  // 3. 입출고+요청 (반출자 포함)
  const combined = [];
  combined.push(['【 이번 주 출고 】 ' + thisOutHist.length + '건 · ' + thisOutCost.toLocaleString() + '원']);
  combined.push(['날짜', '팀', '요청자', '반출자', '업체', '품명', '단위', '수량', '단가(원)', '금액(원)']);
  if (thisOutHist.length === 0) {
    combined.push(['(이번 주 출고 없음)']);
  } else {
    thisOutHist.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''))
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
    thisInHist.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .forEach(h => combined.push([
        (h.date || '').slice(0, 10), h.vendor || '', h.name || '',
        h.unit || '', h.qty || 0, h.price || 0
      ]));
  }
  combined.push([]);
  combined.push(['【 대기 중 요청 】 ' + pendingReq + '건']);
  combined.push(['요청일', '팀', '요청자', '품목 수', '품목 요약', '메모']);
  const pendingList = requests.filter(r => r.status === 'pending')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (pendingList.length === 0) {
    combined.push(['(대기 중인 요청 없음)']);
  } else {
    pendingList.forEach(r => {
      const items = Array.isArray(r.items) ? r.items : [];
      const summary = items.slice(0, 3).map(it => it.name || '').join(', ')
                    + (items.length > 3 ? ' 외 ' + (items.length - 3) + '건' : '');
      combined.push([
        (r.date || '').slice(0, 10), r.team || '',
        r.requester || r.member || '',
        items.length, summary, r.memo || ''
      ]);
    });
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(combined), '입출고+요청');

  // 4. 팀별 이상치 (이번 달 vs 지난 3개월 평균)
  const tmStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const t3Start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const outHist = history.filter(h => h.type === 'out');
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
    ['이상치 분석: ' + monthLabel + ' vs 지난 3개월 월평균 (±30% 이상 변동, 신규/중단)'],
    [],
    ['팀명', '분류', '업체', '품명', monthLabel + ' 수량', '지난 3개월 월평균', '변화율']
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
    const order = { '★ 신규': 0, '▲ 급증': 1, '▼ 감소': 2, '⛔ 중단': 3 };
    teamRows.sort((a, b) => (order[a[1]] || 99) - (order[b[1]] || 99));
    teamRows.forEach(r => { anomRows.push(r); anomCount++; });
  });
  if (anomCount === 0) anomRows.push(['(이상치 없음 — 모든 팀이 평소 사용량 범위 내)']);
  const wsAnom = XLSX.utils.aoa_to_sheet(anomRows);
  applyFormat(wsAnom, [4, 5], 2);
  XLSX.utils.book_append_sheet(wb, wsAnom, '팀별 이상치');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ============================================
// 메일 발송
// ============================================
async function sendEmail(data, today, attachments) {
  const inventory = data.inventory || [];
  const history = data.history || [];
  const requests = data.requests || [];
  const weekKey = getIsoWeek(new Date());

  const totalCost = inventory.reduce((s, it) => s + (it.stock || 0) * (it.price || 0), 0);
  const lowStock = inventory.filter(it => it.stock > 0 && it.stock <= it.minStock).length;
  const outOfStock = inventory.filter(it => it.stock === 0).length;
  const pendingReq = requests.filter(r => r.status === 'pending').length;
  const thisOutHist = history.filter(h => h.type === 'out' && h.weekKey === weekKey);
  const thisOutCost = thisOutHist.reduce((s, h) => s + (h.qty || 0) * (h.price || 0), 0);

  const message = [
    '문치과병원 재고관리 - 주간 자동 백업',
    '═══════════════════════════════════════',
    '',
    '발송일 (KST): ' + today,
    '',
    '【 현재 재고 현황 】',
    '· 등록 품목: ' + inventory.length + '개 (품절 ' + outOfStock + ', 부족 ' + lowStock + ')',
    '· 재고 평가액: ' + totalCost.toLocaleString() + '원',
    '· 대기 중 요청: ' + pendingReq + '건',
    '',
    '【 이번 주 출고 】',
    '· 건수: ' + thisOutHist.length + '건',
    '· 금액: ' + thisOutCost.toLocaleString() + '원',
    '',
    '【 첨부파일 】',
    '· 보고용_' + today + '.xlsx — 의사결정용 리포트 (4개 시트)',
    '· 재난백업용_' + today + '.xlsx — 시스템 복원용 (7개 시트, 반출자 포함)',
    '',
    '※ 본 메일은 GitHub Actions로 매주 토요일 12시 (한국시간) 자동 발송됩니다.',
    '※ 동일 데이터 + 첨부 문서는 Google Drive에도 자동 저장됩니다 (Apps Script).'
  ].join('\n');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  await transporter.sendMail({
    from: '"재고관리 자동백업" <' + process.env.GMAIL_USER + '>',
    to: process.env.BACKUP_RECIPIENT || process.env.GMAIL_USER,
    subject: '[재고관리] 주간 백업 ' + today,
    text: message,
    attachments: attachments
  });
}

main().catch(err => {
  console.error('❌ Backup failed:', err);
  process.exit(1);
});
