// ============================================
// Apps Script: 매주 토요일 12시(KST) Google Drive에 백업 저장
// ============================================
// 동작:
//   1) Firestore에서 데이터 읽기
//   2) Google Sheets 2개 생성 (보고용, 재난백업용)
//   3) Drive의 "재고관리 백업" 폴더에 저장
//   4) 첨부 문서(PDF/이미지)를 "재고관리 백업/문서" 폴더에 sync
//      (이름·크기 같으면 건너뜀 → 매주 똑같은 파일 중복 안 됨)
//
// 실행 방법:
//   - 이 코드를 https://script.google.com 에 새 프로젝트로 붙여넣기
//   - 시간 트리거 등록: 매주 토요일 12시 (한국시간)
//   - 첫 실행 시 Drive/외부 URL 권한 승인
//
// 결과물:
//   사용자의 Google Drive → "재고관리 백업" 폴더 안에:
//   - 보고용_2026-05-09 (Google Sheets, 매주 신규)
//   - 재난백업용_2026-05-09 (Google Sheets, 매주 신규)
//   - 문서/ (서브폴더, Firestore의 첨부 파일들 sync)

const FIRESTORE_PROJECT = 'moon-dental-stock';
const FIRESTORE_PATH = 'appData/main';
const DRIVE_FOLDER_NAME = '재고관리 백업';
const DOCS_SUBFOLDER_NAME = '문서';

// ============================================
// 메인 — 트리거가 호출하는 함수 (매주 토요일 12시)
// ============================================
function weeklyBackup() {
  Logger.log('📅 Weekly backup starting at ' + new Date());

  const data = fetchFirestore();
  Logger.log('Fetched: inv=' + (data.inventory || []).length +
             ', hist=' + (data.history || []).length +
             ', req=' + (data.requests || []).length +
             ', docs=' + (data.documents || []).length);

  // 보호: 데이터 비어있으면 빈 백업 만들지 않음
  if (!Array.isArray(data.inventory) || data.inventory.length === 0) {
    throw new Error('Firestore inventory가 비어있음 — 백업 중단 (데이터 보호)');
  }

  const folder = getOrCreateFolder(DRIVE_FOLDER_NAME);
  const weekLabel = getMonthWeekLabelKr();  // "2026년 5월 1주차"

  // 1. 주차별 보고 + 재난백업
  createReportSheet(data, '주차별보고_' + weekLabel, folder);
  createRecoverySheet(data, '재난백업용_' + weekLabel, folder);

  // 2. 첫째 주 토요일이면 → 직전 월 보고서도 생성
  if (isFirstSaturdayOfMonth()) {
    const prev = getPreviousMonth();
    const monthLabel = prev.year + '년 ' + prev.month + '월';
    Logger.log('📊 첫째 주 토요일 — ' + monthLabel + ' 월별보고 생성');
    createMonthlyReportSheet(data, prev.year, prev.month, '월별보고_' + monthLabel, folder);
  }

  // 3. 첨부 문서 sync (변경된 것만)
  syncDocuments(data, folder);

  Logger.log('✓ 백업 완료 — Drive 폴더: ' + DRIVE_FOLDER_NAME);
}

// 한국식 월/주차 라벨 (KST 기준): "2026년 5월 1주차"
function getMonthWeekLabelKr() {
  const tz = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy/M/d');
  const parts = tz.split('/');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const week = Math.ceil(day / 7);
  return year + '년 ' + month + '월 ' + week + '주차';
}

// 첫째 주 토요일 여부 (월의 1~7일 사이 토요일)
function isFirstSaturdayOfMonth() {
  const tz = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy/M/d/u');
  // u: day of week (1=월, 7=일). 토 = 6
  const parts = tz.split('/');
  const day = parseInt(parts[2], 10);
  const dow = parseInt(parts[3], 10);
  return dow === 6 && day <= 7;
}

// 직전 달 (1-based)
function getPreviousMonth() {
  const tz = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy/M');
  const parts = tz.split('/');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (m === 1) return { year: y - 1, month: 12 };
  return { year: y, month: m - 1 };
}

// 옛 트리거가 호출하는 이름 호환 (이미 dailyBackup 트리거 등록한 경우 대비)
function dailyBackup() { weeklyBackup(); }

// ============================================
// 문서 sync — Firestore documents의 base64를 Drive 파일로 저장
// ============================================
// 매주 동일 파일을 중복 저장하지 않으려고, 이름+크기로 비교.
// Firestore에서 사라진 파일은 Drive에서도 자동 삭제하지 않음 (보존).
function syncDocuments(data, parentFolder) {
  const documents = data.documents || [];
  if (documents.length === 0) {
    Logger.log('첨부 문서 없음 — sync 건너뜀');
    return;
  }

  // "문서" 서브폴더 가져오기 또는 만들기
  let docFolder;
  const subs = parentFolder.getFoldersByName(DOCS_SUBFOLDER_NAME);
  if (subs.hasNext()) {
    docFolder = subs.next();
  } else {
    docFolder = parentFolder.createFolder(DOCS_SUBFOLDER_NAME);
  }

  // 현재 Drive에 있는 파일들 — 이름으로 매핑
  const existing = {};
  const fileIter = docFolder.getFiles();
  while (fileIter.hasNext()) {
    const f = fileIter.next();
    existing[f.getName()] = f;
  }

  let added = 0, updated = 0, skipped = 0, failed = 0;

  documents.forEach(function(d) {
    if (!d.data) { skipped++; return; }  // base64 데이터 없음
    const fileName = d.name || ('document_' + (d.id || Date.now()));

    // 이미 같은 이름 + 같은 크기면 건너뜀
    if (existing[fileName] && existing[fileName].getSize() === (d.size || 0)) {
      skipped++;
      return;
    }

    try {
      // base64 디코드 — "data:image/png;base64,iVBORw..." 또는 raw base64 둘 다 처리
      const idx = d.data.indexOf(',');
      const base64 = (idx >= 0) ? d.data.substring(idx + 1) : d.data;
      const bytes = Utilities.base64Decode(base64);
      const blob = Utilities.newBlob(bytes, d.type || 'application/octet-stream', fileName);

      if (existing[fileName]) {
        // 같은 이름 다른 크기 → 이전 파일 휴지통으로
        existing[fileName].setTrashed(true);
        updated++;
      } else {
        added++;
      }
      docFolder.createFile(blob);
    } catch (e) {
      failed++;
      Logger.log('문서 저장 실패: ' + fileName + ' - ' + e);
    }
  });

  Logger.log('문서 sync 완료 — 추가:' + added + ', 갱신:' + updated +
             ', 건너뜀:' + skipped + ', 실패:' + failed);
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
// 월별보고 Sheets (보고월 기준 6시트)
// ============================================
function createMonthlyReportSheet(data, year, month, name, folder) {
  const ss = SpreadsheetApp.create(name);
  moveFileToFolder(ss.getId(), folder);

  const inventory = data.inventory || [];
  const history = data.history || [];
  const requests = data.requests || [];
  const teams = data.teams || [];
  const documents = data.documents || [];

  const monthLabel = year + '년 ' + month + '월';
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const monthOut = history.filter(function(h) {
    if (h.type !== 'out') return false;
    const d = new Date(h.date);
    return d >= monthStart && d < monthEnd;
  });
  const monthIn = history.filter(function(h) {
    if (h.type !== 'in') return false;
    const d = new Date(h.date);
    return d >= monthStart && d < monthEnd;
  });

  const totalOutQty = monthOut.reduce(function(s, h) { return s + (h.qty || 0); }, 0);
  const totalOutCost = monthOut.reduce(function(s, h) { return s + (h.qty || 0) * (h.price || 0); }, 0);
  const totalInQty = monthIn.reduce(function(s, h) { return s + (h.qty || 0); }, 0);

  // 1. 요약
  const sumSheet = ss.getActiveSheet();
  sumSheet.setName('요약');
  const totalCost = inventory.reduce(function(s, it) { return s + (it.stock || 0) * (it.price || 0); }, 0);
  const outOfStock = inventory.filter(function(it) { return it.stock === 0; }).length;
  const lowStock = inventory.filter(function(it) { return it.stock > 0 && it.stock <= it.minStock; }).length;
  const pendingReq = requests.filter(function(r) { return r.status === 'pending'; }).length;
  writeRows(sumSheet, [
    ['문치과병원 재고관리 - 월별 보고서'],
    [''],
    ['보고월', monthLabel],
    [''],
    ['─── ' + monthLabel + ' 출고 통계 ───'],
    ['출고 건수', monthOut.length],
    ['출고 수량', totalOutQty],
    ['출고 금액(원)', totalOutCost],
    [''],
    ['─── ' + monthLabel + ' 입고 통계 ───'],
    ['입고 건수', monthIn.length],
    ['입고 수량', totalInQty],
    [''],
    ['─── 현재 재고 현황 ───'],
    ['등록 품목', inventory.length],
    ['  · 품절', outOfStock],
    ['  · 부족', lowStock],
    ['재고 평가액(원)', totalCost],
    ['대기 중 요청', pendingReq],
    ['업로드 문서 수', documents.length]
  ]);

  // 2. 팀별 통계
  const teamMap = {};
  monthOut.forEach(function(h) {
    const t = h.team || '(미지정)';
    if (!teamMap[t]) teamMap[t] = { count: 0, qty: 0, cost: 0 };
    teamMap[t].count++;
    teamMap[t].qty += h.qty || 0;
    teamMap[t].cost += (h.qty || 0) * (h.price || 0);
  });
  const teamRows = [['팀명', '출고 건수', '출고 수량', '출고 금액(원)', '비율(%)']];
  Object.keys(teamMap).map(function(t) { return [t, teamMap[t]]; })
    .sort(function(a, b) { return b[1].cost - a[1].cost; })
    .forEach(function(pair) {
      const t = pair[0], s = pair[1];
      const pct = totalOutCost > 0 ? Math.round((s.cost / totalOutCost) * 1000) / 10 : 0;
      teamRows.push([t, s.count, s.qty, s.cost, pct]);
    });
  if (teamRows.length === 1) teamRows.push(['(' + monthLabel + ' 출고 없음)']);
  writeRows(ss.insertSheet('팀별 통계'), teamRows);

  // 3. 업체별 통계
  const vendorMap = {};
  monthOut.forEach(function(h) {
    const v = h.vendor || '(미지정)';
    if (!vendorMap[v]) vendorMap[v] = { count: 0, qty: 0, cost: 0 };
    vendorMap[v].count++;
    vendorMap[v].qty += h.qty || 0;
    vendorMap[v].cost += (h.qty || 0) * (h.price || 0);
  });
  const vendorRows = [['업체명', '출고 건수', '출고 수량', '출고 금액(원)', '비율(%)']];
  Object.keys(vendorMap).map(function(v) { return [v, vendorMap[v]]; })
    .sort(function(a, b) { return b[1].cost - a[1].cost; })
    .forEach(function(pair) {
      const v = pair[0], s = pair[1];
      const pct = totalOutCost > 0 ? Math.round((s.cost / totalOutCost) * 1000) / 10 : 0;
      vendorRows.push([v, s.count, s.qty, s.cost, pct]);
    });
  if (vendorRows.length === 1) vendorRows.push(['(' + monthLabel + ' 출고 없음)']);
  writeRows(ss.insertSheet('업체별 통계'), vendorRows);

  // 4. TOP 품목
  const itemMap = {};
  monthOut.forEach(function(h) {
    const k = (h.vendor || '') + '::' + (h.name || '');
    if (!itemMap[k]) itemMap[k] = { vendor: h.vendor, name: h.name, unit: h.unit, qty: 0, cost: 0 };
    itemMap[k].qty += h.qty || 0;
    itemMap[k].cost += (h.qty || 0) * (h.price || 0);
  });
  const itemRows = [['순위', '업체', '품명', '단위', '출고 수량', '출고 금액(원)']];
  Object.keys(itemMap).map(function(k) { return itemMap[k]; })
    .sort(function(a, b) { return b.cost - a.cost; })
    .forEach(function(s, i) {
      itemRows.push([i + 1, s.vendor || '', s.name || '', s.unit || '', s.qty, s.cost]);
    });
  if (itemRows.length === 1) itemRows.push(['(' + monthLabel + ' 출고 없음)']);
  writeRows(ss.insertSheet('TOP 품목'), itemRows);

  // 5. 팀별 AI 분석 (보고월 vs 직전 3개월) + 팀별 자동 코멘트
  const prev3Start = new Date(year, month - 4, 1);
  const past3 = history.filter(function(h) {
    if (h.type !== 'out') return false;
    const d = new Date(h.date);
    return d >= prev3Start && d < monthStart;
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
  const thisByTeam = aggByTeamItem(monthOut);
  const past3ByTeam = aggByTeamItem(past3);
  const allTeams = {};
  Object.keys(thisByTeam).forEach(function(t) { allTeams[t] = true; });
  Object.keys(past3ByTeam).forEach(function(t) { allTeams[t] = true; });

  const anomRows = [
    ['AI 분석: ' + monthLabel + ' vs 직전 3개월 월평균 + 팀별 자동 코멘트'],
    [],
    ['팀명', '분류', '업체', '품명', monthLabel + ' 수량', '직전 3개월 월평균', '변화율']
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
    const tRows = [];
    const itemsForComment = [];
    Object.keys(allKeys).forEach(function(k) {
      const thisQty = thisItems[k] ? thisItems[k].qty : 0;
      const pastQty = past3Items[k] ? past3Items[k].qty : 0;
      const pastAvg = pastQty / 3;
      const meta = thisItems[k] || past3Items[k];
      const price = priceLookupGS(inventory, history, meta.vendor, meta.name);
      const costImpact = (thisQty - pastAvg) * price;
      if (pastAvg === 0 && thisQty > 0) {
        tRows.push([team, '★ 신규', meta.vendor, meta.name, thisQty, 0, '신규']);
        itemsForComment.push({ kind: 'new', name: meta.name, vendor: meta.vendor, thisQty: thisQty, pastAvg: pastAvg, price: price, costImpact: costImpact });
      } else if (pastAvg > 0 && thisQty === 0) {
        tRows.push([team, '⛔ 중단', meta.vendor, meta.name, 0, Math.round(pastAvg * 10) / 10, '-100%']);
        itemsForComment.push({ kind: 'gone', name: meta.name, vendor: meta.vendor, thisQty: thisQty, pastAvg: pastAvg, price: price, costImpact: costImpact });
      } else if (pastAvg > 0) {
        const diffPct = ((thisQty - pastAvg) / pastAvg) * 100;
        if (diffPct >= 30) {
          tRows.push([team, '▲ 급증', meta.vendor, meta.name, thisQty, Math.round(pastAvg * 10) / 10, '+' + Math.round(diffPct) + '%']);
          itemsForComment.push({ kind: 'up', name: meta.name, vendor: meta.vendor, thisQty: thisQty, pastAvg: pastAvg, price: price, costImpact: costImpact, diffPct: diffPct });
        } else if (diffPct <= -30) {
          tRows.push([team, '▼ 감소', meta.vendor, meta.name, thisQty, Math.round(pastAvg * 10) / 10, Math.round(diffPct) + '%']);
          itemsForComment.push({ kind: 'down', name: meta.name, vendor: meta.vendor, thisQty: thisQty, pastAvg: pastAvg, price: price, costImpact: costImpact, diffPct: diffPct });
        }
      }
    });
    if (tRows.length > 0) {
      anomRows.push(['💬 ' + team + ' 자동 분석', generateTeamCommentTextGS(itemsForComment)]);
      const order = { '★ 신규': 0, '▲ 급증': 1, '▼ 감소': 2, '⛔ 중단': 3 };
      tRows.sort(function(a, b) { return (order[a[1]] || 99) - (order[b[1]] || 99); });
      tRows.forEach(function(r) { anomRows.push(r); anomCount++; });
      anomRows.push([]);
    }
  });
  if (anomCount === 0) anomRows.push(['(특이 변동 없음)']);
  writeRows(ss.insertSheet('팀별 AI 분석'), anomRows);

  // 6. 출고 원장 (반출자 포함)
  const ledgerRows = [['날짜', '팀', '요청자', '반출자', '업체', '품명', '단위', '수량', '단가(원)', '금액(원)']];
  monthOut.slice().sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); })
    .forEach(function(h) {
      ledgerRows.push([
        (h.date || '').slice(0, 10), h.team || '',
        h.requester || h.member || '', h.releasedBy || '',
        h.vendor || '', h.name || '', h.unit || '',
        h.qty || 0, h.price || 0, (h.qty || 0) * (h.price || 0)
      ]);
    });
  if (ledgerRows.length === 1) ledgerRows.push(['(' + monthLabel + ' 출고 없음)']);
  writeRows(ss.insertSheet('출고 원장'), ledgerRows);
}

// 가격 조회 (Apps Script용)
function priceLookupGS(inventory, history, vendor, name) {
  const inv = inventory.find(function(i) { return i.vendor === vendor && i.name === name; });
  if (inv && inv.price) return inv.price;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.vendor === vendor && h.name === name && h.price) return h.price;
  }
  return 0;
}

// 비용 포맷 (Apps Script용)
function formatWonPlainGS(n) {
  if (Math.abs(n) >= 10000) return (Math.round(n / 1000) / 10) + '만원';
  if (Math.abs(n) >= 1000) return Math.round(n / 100) / 10 + '천원';
  return Math.round(n) + '원';
}

// 팀별 자동 코멘트 생성 (Apps Script용)
function generateTeamCommentTextGS(items) {
  const ups = items.filter(function(i) { return i.kind === 'up'; });
  const downs = items.filter(function(i) { return i.kind === 'down'; });
  const news = items.filter(function(i) { return i.kind === 'new'; });
  const gones = items.filter(function(i) { return i.kind === 'gone'; });

  const positiveImpact = items.filter(function(i) { return (i.costImpact || 0) > 0; })
    .reduce(function(s, i) { return s + i.costImpact; }, 0);
  const negativeImpact = items.filter(function(i) { return (i.costImpact || 0) < 0; })
    .reduce(function(s, i) { return s + Math.abs(i.costImpact); }, 0);
  const netImpact = positiveImpact - negativeImpact;

  const parts = [];
  if (ups.length >= 3 && downs.length === 0) parts.push('👥 환자 수/시술량 증가 시그널');
  else if (downs.length >= 3 && ups.length === 0) parts.push('📉 환자 수/시술량 감소 또는 대체재 도입');
  else if (ups.length >= 2 && downs.length >= 2) parts.push('🔄 시술 구성 변화 또는 치료 프로토콜 변경');
  if (news.length >= 2) parts.push('✨ ' + news.length + '개 신규 품목 → 새 시술/재료 도입 가능성');
  else if (news.length === 1) parts.push('✨ 신규 사용: ' + news[0].name);
  if (gones.length >= 2) parts.push('⏸ ' + gones.length + '개 품목 사용 중단 → 재고 정리 검토');
  if (Math.abs(netImpact) > 1000) {
    if (netImpact > 0) parts.push('💰 평소 대비 +' + formatWonPlainGS(netImpact) + ' 추가 지출');
    else parts.push('💰 평소 대비 -' + formatWonPlainGS(Math.abs(netImpact)) + ' 절약');
  }
  if (parts.length === 0) return '✅ 평소와 비슷한 사용 패턴 — 안정적 운영';
  return parts.join(' / ');
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

  // ─ 4. 팀별 AI 분석 (이번 달 vs 지난 3개월) ─
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
    ['AI 분석: ' + monthLabel + ' vs 지난 3개월 월평균 + 팀별 자동 코멘트'],
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
    const itemsForComment = [];
    Object.keys(allKeys).forEach(function(k) {
      const thisQty = thisItems[k] ? thisItems[k].qty : 0;
      const pastQty = past3Items[k] ? past3Items[k].qty : 0;
      const pastAvg = pastQty / 3;
      const meta = thisItems[k] || past3Items[k];
      const price = priceLookupGS(inventory, history, meta.vendor, meta.name);
      const costImpact = (thisQty - pastAvg) * price;
      if (pastAvg === 0 && thisQty > 0) {
        teamRows.push([team, '★ 신규', meta.vendor, meta.name, thisQty, 0, '신규']);
        itemsForComment.push({ kind: 'new', name: meta.name, vendor: meta.vendor, thisQty: thisQty, pastAvg: pastAvg, price: price, costImpact: costImpact });
      } else if (pastAvg > 0 && thisQty === 0) {
        teamRows.push([team, '⛔ 중단', meta.vendor, meta.name, 0, Math.round(pastAvg * 10) / 10, '-100%']);
        itemsForComment.push({ kind: 'gone', name: meta.name, vendor: meta.vendor, thisQty: thisQty, pastAvg: pastAvg, price: price, costImpact: costImpact });
      } else if (pastAvg > 0) {
        const diffPct = ((thisQty - pastAvg) / pastAvg) * 100;
        if (diffPct >= 30) {
          teamRows.push([team, '▲ 급증', meta.vendor, meta.name, thisQty, Math.round(pastAvg * 10) / 10, '+' + Math.round(diffPct) + '%']);
          itemsForComment.push({ kind: 'up', name: meta.name, vendor: meta.vendor, thisQty: thisQty, pastAvg: pastAvg, price: price, costImpact: costImpact, diffPct: diffPct });
        } else if (diffPct <= -30) {
          teamRows.push([team, '▼ 감소', meta.vendor, meta.name, thisQty, Math.round(pastAvg * 10) / 10, Math.round(diffPct) + '%']);
          itemsForComment.push({ kind: 'down', name: meta.name, vendor: meta.vendor, thisQty: thisQty, pastAvg: pastAvg, price: price, costImpact: costImpact, diffPct: diffPct });
        }
      }
    });
    if (teamRows.length > 0) {
      anomRows.push(['💬 ' + team + ' 자동 분석', generateTeamCommentTextGS(itemsForComment)]);
      const order = { '★ 신규': 0, '▲ 급증': 1, '▼ 감소': 2, '⛔ 중단': 3 };
      teamRows.sort(function(a, b) { return (order[a[1]] || 99) - (order[b[1]] || 99); });
      teamRows.forEach(function(r) { anomRows.push(r); anomCount++; });
      anomRows.push([]);
    }
  });
  if (anomCount === 0) anomRows.push(['(특이 변동 없음)']);
  writeRows(ss.insertSheet('팀별 AI 분석'), anomRows);
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
