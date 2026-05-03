// ============================================
// Apps Script: 매일 12시(KST) Google Drive에 백업 저장
// ============================================
// 동작:
//   1) Firestore에서 데이터 읽기
//   2) Google Sheets 2개 생성 (보고용, 재난백업용)
//   3) Drive의 "재고관리 백업" 폴더에 저장
//
// 실행 방법:
//   - 이 코드를 https://script.google.com 에 새 프로젝트로 붙여넣기
//   - 시간 트리거 등록: 매일 12시 (한국시간)
//   - 첫 실행 시 Drive/외부 URL 권한 승인
//
// 결과물:
//   사용자의 Google Drive → "재고관리 백업" 폴더에 매일 파일이 쌓임
//   - 보고용_2026-05-03 (Google Sheets)
//   - 재난백업용_2026-05-03 (Google Sheets)
//   각 파일은 Sheets로 열거나 Excel(.xlsx)로 다운로드 가능

const FIRESTORE_PROJECT = 'moon-dental-stock';
const FIRESTORE_PATH = 'appData/main';
const DRIVE_FOLDER_NAME = '재고관리 백업';

// ============================================
// 메인 — 트리거가 호출하는 함수
// ============================================
function dailyBackup() {
  Logger.log('🌙 Daily backup starting at ' + new Date());

  const data = fetchFirestore();
  Logger.log('Fetched: inv=' + (data.inventory || []).length +
             ', hist=' + (data.history || []).length +
             ', req=' + (data.requests || []).length);

  // 보호: 데이터 비어있으면 빈 백업 만들지 않음
  if (!Array.isArray(data.inventory) || data.inventory.length === 0) {
    throw new Error('Firestore inventory가 비어있음 — 백업 중단 (데이터 보호)');
  }

  const folder = getOrCreateFolder(DRIVE_FOLDER_NAME);
  const today = todayKst();

  createReportSheet(data, '보고용_' + today, folder);
  createRecoverySheet(data, '재난백업용_' + today, folder);

  Logger.log('✓ 백업 완료 — Drive 폴더: ' + DRIVE_FOLDER_NAME);
}

// ============================================
// Firestore REST + 타입 파서
// ============================================
function fetchFirestore() {
  const url = 'https://firestore.googleapis.com/v1/projects/' + FIRESTORE_PROJECT +
              '/databases/(default)/documents/' + FIRESTORE_PATH;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error('Firestore fetch 실패: HTTP ' + response.getResponseCode() +
                    ' — ' + response.getContentText().substring(0, 300));
  }
  const json = JSON.parse(response.getContentText());
  return parseFirestoreDoc(json.fields || {});
}

function parseFirestoreDoc(fields) {
  const out = {};
  for (const key in fields) {
    out[key] = parseFirestoreValue(fields[key]);
  }
  return out;
}

function parseFirestoreValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(parseFirestoreValue);
  if ('mapValue' in v) return parseFirestoreDoc(v.mapValue.fields || {});
  return null;
}

// ============================================
// 시간/폴더 유틸
// ============================================
function todayKst() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
}

function isoWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getFullYear() + '-W' + ('0' + weekNo).slice(-2);
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

// 새 Spreadsheet를 지정 폴더로 이동
function moveFileToFolder(fileId, folder) {
  const file = DriveApp.getFileById(fileId);
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
}

function writeRows(sheet, rows) {
  if (!rows || rows.length === 0) return;
  let numCols = 1;
  rows.forEach(r => { if (r.length > numCols) numCols = r.length; });
  // pad
  const padded = rows.map(r => {
    const copy = r.slice();
    while (copy.length < numCols) copy.push('');
    return copy;
  });
  sheet.getRange(1, 1, padded.length, numCols).setValues(padded);
  // 첫 행 굵게
  sheet.getRange(1, 1, 1, numCols).setFontWeight('bold');
  // 자동 너비
  sheet.autoResizeColumns(1, numCols);
}

// ============================================
// 보고용 Sheets
// ============================================
function createReportSheet(data, name, folder) {
  const ss = SpreadsheetApp.create(name);
  moveFileToFolder(ss.getId(), folder);

  const inventory = data.inventory || [];
  const history = data.history || [];
  const requests = data.requests || [];
  const teams = data.teams || [];

  const today = todayKst();
  const weekKey = isoWeek(new Date());

  const totalCost = inventory.reduce(function(s, it) { return s + (it.stock || 0) * (it.price || 0); }, 0);
  const outOfStock = inventory.filter(function(it) { return it.stock === 0; }).length;
  const lowStock = inventory.filter(function(it) { return it.stock > 0 && it.stock <= it.minStock; }).length;
  const pendingReq = requests.filter(function(r) { return r.status === 'pending'; }).length;
  const thisOutHist = history.filter(function(h) { return h.type === 'out' && h.weekKey === weekKey; });
  const thisInHist = history.filter(function(h) { return h.type === 'in' && h.weekKey === weekKey; });
  const thisOutQty = thisOutHist.reduce(function(s, h) { return s + (h.qty || 0); }, 0);
  const thisOutCost = thisOutHist.reduce(function(s, h) { return s + (h.qty || 0) * (h.price || 0); }, 0);
  const thisInQty = thisInHist.reduce(function(s, h) { return s + (h.qty || 0); }, 0);

  // ─ 1. 요약 ─
  const sumSheet = ss.getActiveSheet();
  sumSheet.setName('요약');
  writeRows(sumSheet, [
    ['문치과병원 재고관리 - 일일 보고서'],
    [''],
    ['보고일 (KST)', today],
    ['주차', weekKey],
    [''],
    ['─── 현재 재고 현황 ───'],
    ['등록 품목', inventory.length],
    ['  · 품절', outOfStock],
    ['  · 부족', lowStock],
    ['재고 평가액(원)', totalCost],
    [''],
    ['─── 이번 주 활동 ───'],
    ['출고 건수', thisOutHist.length],
    ['출고 수량', thisOutQty],
    ['출고 금액(원)', thisOutCost],
    ['입고 건수', thisInHist.length],
    ['입고 수량', thisInQty],
    ['대기 요청', pendingReq]
  ]);

  // ─ 2. 품목 (상태순) ─
  const invSorted = inventory.slice().sort(function(a, b) {
    const sA = a.stock === 0 ? 0 : (a.stock <= a.minStock ? 1 : 2);
    const sB = b.stock === 0 ? 0 : (b.stock <= b.minStock ? 1 : 2);
    if (sA !== sB) return sA - sB;
    return (a.vendor || '').localeCompare(b.vendor || '') ||
           (a.name || '').localeCompare(b.name || '');
  });
  const invRows = [['상태', '업체', '품명', '단위', '단가(원)', '현재 재고', '부족기준']];
  invSorted.forEach(function(it) {
    const status = it.stock === 0 ? '품절' : (it.stock <= it.minStock ? '부족' : '정상');
    invRows.push([status, it.vendor || '', it.name || '', it.unit || '',
                  it.price || 0, it.stock || 0, it.minStock || 0]);
  });
  writeRows(ss.insertSheet('품목'), invRows);

  // ─ 3. 입출고+요청 (반출자 포함) ─
  const combined = [];
  combined.push(['【 이번 주 출고 】 ' + thisOutHist.length + '건 · ' + thisOutCost.toLocaleString() + '원']);
  combined.push(['날짜', '팀', '요청자', '반출자', '업체', '품명', '단위', '수량', '단가(원)', '금액(원)']);
  if (thisOutHist.length === 0) combined.push(['(이번 주 출고 없음)']);
  else thisOutHist.slice().sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); })
    .forEach(function(h) {
      combined.push([
        (h.date || '').slice(0, 10), h.team || '',
        h.requester || h.member || '', h.releasedBy || '',
        h.vendor || '', h.name || '', h.unit || '',
        h.qty || 0, h.price || 0, (h.qty || 0) * (h.price || 0)
      ]);
    });
  combined.push([]);
  combined.push(['【 이번 주 입고 】 ' + thisInHist.length + '건']);
  combined.push(['날짜', '업체', '품명', '단위', '수량', '단가(원)']);
  if (thisInHist.length === 0) combined.push(['(이번 주 입고 없음)']);
  else thisInHist.slice().sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); })
    .forEach(function(h) {
      combined.push([
        (h.date || '').slice(0, 10), h.vendor || '', h.name || '',
        h.unit || '', h.qty || 0, h.price || 0
      ]);
    });
  combined.push([]);
  combined.push(['【 대기 중 요청 】 ' + pendingReq + '건']);
  combined.push(['요청일', '팀', '요청자', '품목 수', '품목 요약', '메모']);
  const pendingList = requests.filter(function(r) { return r.status === 'pending'; })
    .sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
  if (pendingList.length === 0) combined.push(['(대기 중인 요청 없음)']);
  else pendingList.forEach(function(r) {
    const items = Array.isArray(r.items) ? r.items : [];
    const summary = items.slice(0, 3).map(function(it) { return it.name || ''; }).join(', ') +
                    (items.length > 3 ? ' 외 ' + (items.length - 3) + '건' : '');
    combined.push([
      (r.date || '').slice(0, 10), r.team || '',
      r.requester || r.member || '',
      items.length, summary, r.memo || ''
    ]);
  });
  writeRows(ss.insertSheet('입출고+요청'), combined);

  // ─ 4. 팀별 이상치 (이번 달 vs 지난 3개월) ─
  const now = new Date();
  const tmStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const t3Start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const outHist = history.filter(function(h) { return h.type === 'out'; });
  const thisMonth = outHist.filter(function(h) { return new Date(h.date) >= tmStart; });
  const past3 = outHist.filter(function(h) {
    const d = new Date(h.date);
    return d >= t3Start && d < tmStart;
  });
  function aggByTeamItem(arr) {
    const map = {};
    arr.forEach(function(h) {
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
  const allTeams = {};
  Object.keys(thisByTeam).forEach(function(t) { allTeams[t] = true; });
  Object.keys(past3ByTeam).forEach(function(t) { allTeams[t] = true; });
  const monthLabel = tmStart.getFullYear() + '년 ' + (tmStart.getMonth() + 1) + '월';

  const anomRows = [
    ['이상치 분석: ' + monthLabel + ' vs 지난 3개월 월평균 (±30% 이상 변동, 신규/중단)'],
    [],
    ['팀명', '분류', '업체', '품명', monthLabel + ' 수량', '지난 3개월 월평균', '변화율']
  ];
  let anomCount = 0;
  Object.keys(allTeams).sort(function(a, b) {
    const ai = teams.indexOf(a), bi = teams.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  }).forEach(function(team) {
    const thisItems = thisByTeam[team] || {};
    const past3Items = past3ByTeam[team] || {};
    const allKeys = {};
    Object.keys(thisItems).forEach(function(k) { allKeys[k] = true; });
    Object.keys(past3Items).forEach(function(k) { allKeys[k] = true; });
    const teamRows = [];
    Object.keys(allKeys).forEach(function(k) {
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
    teamRows.sort(function(a, b) { return (order[a[1]] || 99) - (order[b[1]] || 99); });
    teamRows.forEach(function(r) { anomRows.push(r); anomCount++; });
  });
  if (anomCount === 0) anomRows.push(['(이상치 없음)']);
  writeRows(ss.insertSheet('팀별 이상치'), anomRows);
}

// ============================================
// 재난백업용 Sheets
// ============================================
function createRecoverySheet(data, name, folder) {
  const ss = SpreadsheetApp.create(name);
  moveFileToFolder(ss.getId(), folder);

  const inventory = data.inventory || [];
  const history = data.history || [];
  const requests = data.requests || [];
  const teams = data.teams || [];
  const teamMembers = data.teamMembers || {};
  const documents = data.documents || [];

  // 메타
  const metaSheet = ss.getActiveSheet();
  metaSheet.setName('메타');
  writeRows(metaSheet, [
    ['문치과병원 재고관리 - 재난복구용 백업'],
    [''],
    ['추출일 (KST)', todayKst()],
    ['주차', isoWeek(new Date())],
    ['용도', '시스템 복원 (사람이 읽는 자료 아님)'],
    [''],
    ['품목 수', inventory.length],
    ['이력 수', history.length],
    ['요청 수', requests.length],
    ['팀 수', teams.length],
    ['담당자 수', Object.keys(teamMembers).reduce(function(s, k) {
      return s + (Array.isArray(teamMembers[k]) ? teamMembers[k].length : 0);
    }, 0)],
    ['문서 수', documents.length]
  ]);

  // 품목 (전체)
  const invRows = [['ID', '업체', '품명', '단위', '단가', '재고', '부족기준', '카테고리']];
  inventory.forEach(function(it) {
    invRows.push([
      it.id || '', it.vendor || '', it.name || '', it.unit || '',
      it.price || 0, it.stock || 0, it.minStock || 0, it.category || ''
    ]);
  });
  writeRows(ss.insertSheet('품목'), invRows);

  // 입출고이력 (반출자 포함)
  const histRows = [['ID', '날짜', '주차', '구분', '팀', '요청자', '반출자', '업체', '품명', '단위', '수량', '단가']];
  history.forEach(function(h) {
    histRows.push([
      h.id || '', h.date || '', h.weekKey || '', h.type || '',
      h.team || '', h.requester || h.member || '', h.releasedBy || '',
      h.vendor || '', h.name || '',
      h.unit || '', h.qty || 0, h.price || 0
    ]);
  });
  writeRows(ss.insertSheet('입출고이력'), histRows);

  // 반출요청 (반출자 포함)
  const reqRows = [['ID', '요청일', '상태', '팀', '요청자', '반출자', '품목수', '메모']];
  requests.forEach(function(r) {
    reqRows.push([
      r.id || '', r.date || '', r.status || '',
      r.team || '', r.requester || r.member || '',
      r.releasedBy || '',
      Array.isArray(r.items) ? r.items.length : 0,
      r.memo || ''
    ]);
  });
  writeRows(ss.insertSheet('반출요청'), reqRows);

  // 팀_담당자
  const teamRows = [['팀명', '담당자', '대표 여부']];
  teams.forEach(function(t) {
    const members = teamMembers[t] || [];
    if (members.length === 0) {
      teamRows.push([t, '(없음)', '']);
    } else {
      members.forEach(function(m, i) {
        teamRows.push([t, m, i === 0 ? '대표' : '']);
      });
    }
  });
  writeRows(ss.insertSheet('팀_담당자'), teamRows);

  // 문서_메타
  const docRows = [['ID', '업체', '파일명', '타입', '크기(byte)', '업로드일']];
  documents.forEach(function(d) {
    docRows.push([
      d.id || '', d.vendor || '', d.name || '',
      d.type || '', d.size || 0, d.uploadedAt || ''
    ]);
  });
  writeRows(ss.insertSheet('문서_메타'), docRows);
}
