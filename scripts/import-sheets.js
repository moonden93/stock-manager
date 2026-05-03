// ============================================
// import-sheets.js: Google Sheets 25개를 읽어 history 레코드 생성
// ============================================
// 출력: scripts/sheet-history.json
//   { weekKey, date, type, vendor, name, unit, price, qty, team } 형식
//
// 실행: cd scripts && node import-sheets.js

const fs = require('fs');
const path = require('path');

const SHEET_ID = '1i7SUPARAyqN9UQZjS29jMHwMouMAG3hFNZLuIY9bHn0';

// 시트 이름 → gid + 날짜 매핑
// 날짜 규칙: 해당 월 1일 + (주차-1)*7
const SHEETS = [
  { name: '11월1주차',    gid: 0,          year: 2025, month: 11, week: 1 },
  { name: '11월2주차',    gid: 1824742373, year: 2025, month: 11, week: 2 },
  { name: '11월3주차',    gid: 1157102687, year: 2025, month: 11, week: 3 },
  { name: '12월1주차',    gid: 1557173925, year: 2025, month: 12, week: 1 },
  { name: '12월2주차',    gid: 344420402,  year: 2025, month: 12, week: 2 },
  { name: '12월3주차',    gid: 1423526200, year: 2025, month: 12, week: 3 },
  { name: '12월4주차',    gid: 485372481,  year: 2025, month: 12, week: 4 },
  { name: '26년1월1주차', gid: 2097260299, year: 2026, month: 1,  week: 1 },
  { name: '26년1월2주차', gid: 147639982,  year: 2026, month: 1,  week: 2 },
  { name: '26년1월3주차', gid: 770466824,  year: 2026, month: 1,  week: 3 },
  { name: '26년1월4주차', gid: 2024840999, year: 2026, month: 1,  week: 4 },
  { name: '26년2월1주차', gid: 723324945,  year: 2026, month: 2,  week: 1 },
  { name: '26년2월2주차', gid: 1011055045, year: 2026, month: 2,  week: 2 },
  { name: '26년2월3주차', gid: 79396917,   year: 2026, month: 2,  week: 3 },
  { name: '26년2월4주차', gid: 550764948,  year: 2026, month: 2,  week: 4 },
  { name: '26년3월1주차', gid: 1321812024, year: 2026, month: 3,  week: 1 },
  { name: '26년3월2주차', gid: 1854801106, year: 2026, month: 3,  week: 2 },
  { name: '26년3월3주차', gid: 1525364882, year: 2026, month: 3,  week: 3 },
  { name: '26년3월4주차', gid: 127967330,  year: 2026, month: 3,  week: 4 },
  { name: '26년4월1주차', gid: 1625785604, year: 2026, month: 4,  week: 1 },
  { name: '26년4월2주차', gid: 1087998001, year: 2026, month: 4,  week: 2 },
  { name: '26년4월3주차', gid: 1984961719, year: 2026, month: 4,  week: 3 },
  { name: '26년4월4주차', gid: 602599127,  year: 2026, month: 4,  week: 4 },
  { name: '26년4월5주차', gid: 995236176,  year: 2026, month: 4,  week: 5 }
];

// CSV 파서 (쌍따옴표/멀티라인 셀 지원)
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { inQuote = false; }
      else { cell += c; }
    } else {
      if (c === '"') { inQuote = true; }
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c === '\r') {}
      else { cell += c; }
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function fetchSheet(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  return fetch(url).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  });
}

// 단가 문자열 → 숫자 (예: "20,500" → 20500)
function parsePrice(s) {
  if (!s) return 0;
  const n = parseInt(String(s).replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function parseQty(s) {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ISO weekKey (YYYY-Www)
function getWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getFullYear() + '-W' + String(weekNo).padStart(2, '0');
}

// 헤더에서 팀 컬럼 인덱스 찾기. 팀 이름 정규화.
function normalizeTeamName(raw) {
  // "Dr.\n이승주팀" → "Dr. 이승주팀"
  // "9층 \n공통" → "9층 공통"
  return raw.replace(/\s+/g, ' ').trim();
}

const TEAM_NAME_PATTERNS = [/Dr\./, /^\d+층/];

function isTeamColumn(headerName) {
  return TEAM_NAME_PATTERNS.some(p => p.test(headerName));
}

async function processSheet(sheetMeta) {
  const records = [];
  console.log(`[${sheetMeta.name}] 다운로드 중...`);
  const csv = await fetchSheet(sheetMeta.gid);
  const rows = parseCSV(csv);
  if (rows.length < 2) {
    console.warn(`  ⚠️ ${sheetMeta.name}: 데이터 없음`);
    return records;
  }

  const headers = rows[0].map(normalizeTeamName);
  const colIdx = {};
  const teamCols = [];

  headers.forEach((h, i) => {
    if (h === '업체명')   colIdx.vendor = i;
    if (h === '품명')     colIdx.name = i;
    if (h === '규격')     colIdx.unit = i;
    if (h === '단가')     colIdx.price = i;
    if (h === '입고량')   colIdx.in = i;
    if (isTeamColumn(h))  teamCols.push({ index: i, team: h });
  });

  if (colIdx.vendor === undefined || colIdx.name === undefined) {
    console.warn(`  ⚠️ ${sheetMeta.name}: 필수 컬럼 없음`);
    return records;
  }

  // 날짜 = 해당 월 1일 + (주차-1)*7
  const baseDate = new Date(sheetMeta.year, sheetMeta.month - 1, 1 + (sheetMeta.week - 1) * 7);
  const dateISO = baseDate.toISOString();
  const weekKey = getWeekKey(baseDate);

  let rowsProcessed = 0, outRecords = 0, inRecords = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const vendor = (row[colIdx.vendor] || '').trim();
    const name = (row[colIdx.name] || '').trim();
    if (!vendor || !name) continue;
    rowsProcessed++;
    const unit = colIdx.unit !== undefined ? (row[colIdx.unit] || '').trim() : '';
    const price = colIdx.price !== undefined ? parsePrice(row[colIdx.price]) : 0;

    // 입고
    if (colIdx.in !== undefined) {
      const qty = parseQty(row[colIdx.in]);
      if (qty > 0) {
        records.push({
          id: 'H' + sheetMeta.gid + '_in_' + i,
          type: 'in',
          date: dateISO,
          weekKey: weekKey,
          vendor, name, unit, price, qty,
          team: '', requester: '', note: '시트 import'
        });
        inRecords++;
      }
    }

    // 출고 (팀별)
    teamCols.forEach(({ index, team }) => {
      const qty = parseQty(row[index]);
      if (qty > 0) {
        records.push({
          id: 'H' + sheetMeta.gid + '_out_' + i + '_' + index,
          type: 'out',
          date: dateISO,
          weekKey: weekKey,
          vendor, name, unit, price, qty,
          team: team, requester: '', note: '시트 import'
        });
        outRecords++;
      }
    });
  }

  console.log(`  ✓ ${sheetMeta.name} (${dateISO.slice(0, 10)}, ${weekKey}): ${rowsProcessed}행 → 출고 ${outRecords}, 입고 ${inRecords}`);
  return records;
}

// 가장 최신 시트(=마지막)에서 inventory 추출
// 한 행당 한 품목, "현 재고량" 컬럼이 있어 현재 재고 스냅샷 가능
async function extractInventoryFromLatestSheet() {
  const latest = SHEETS[SHEETS.length - 1];
  console.log(`[inventory] ${latest.name}에서 추출 중...`);
  const csv = await fetchSheet(latest.gid);
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeTeamName);
  const idx = {};
  headers.forEach((h, i) => {
    if (h === '업체명')   idx.vendor = i;
    if (h === '종류')     idx.category = i;
    if (h === '품명')     idx.name = i;
    if (h === '규격')     idx.unit = i;
    if (h === '단가')     idx.price = i;
    if (h === '현 재고량') idx.stock = i;
    if (h === '기준 재고량') idx.minStock = i;
  });

  const items = [];
  let id = 1;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const vendor = (row[idx.vendor] || '').trim();
    const name = (row[idx.name] || '').trim();
    if (!vendor || !name) continue;
    items.push({
      id: 'M' + String(id).padStart(4, '0'),
      vendor, name,
      unit: idx.unit !== undefined ? (row[idx.unit] || '').trim() : '',
      price: idx.price !== undefined ? parsePrice(row[idx.price]) : 0,
      stock: idx.stock !== undefined ? parseInt(parseQty(row[idx.stock]), 10) || 0 : 0,
      minStock: idx.minStock !== undefined ? parseInt(parseQty(row[idx.minStock]), 10) || 0 : 0,
      category: idx.category !== undefined ? (row[idx.category] || '치과재료').trim() : '치과재료'
    });
    id++;
  }
  console.log(`  ✓ inventory ${items.length}개 추출`);
  return items;
}

async function main() {
  console.log('Google Sheets → history 레코드 변환 시작');
  console.log('총 시트 수:', SHEETS.length);
  console.log('');

  const allRecords = [];
  for (const sheet of SHEETS) {
    try {
      const records = await processSheet(sheet);
      allRecords.push(...records);
    } catch (err) {
      console.error(`  ❌ ${sheet.name} 실패:`, err.message);
    }
  }

  console.log('');
  console.log('총 history 레코드:', allRecords.length);

  // 월별 통계
  const byMonth = {};
  allRecords.forEach(r => {
    const ym = r.date.slice(0, 7);
    if (!byMonth[ym]) byMonth[ym] = { out: 0, in: 0 };
    byMonth[ym][r.type]++;
  });
  console.log('월별 출고/입고:');
  Object.keys(byMonth).sort().forEach(ym => {
    console.log(`  ${ym}: 출고 ${byMonth[ym].out}, 입고 ${byMonth[ym].in}`);
  });

  // 팀별 출고 수
  const byTeam = {};
  allRecords.filter(r => r.type === 'out').forEach(r => {
    byTeam[r.team] = (byTeam[r.team] || 0) + 1;
  });
  console.log('');
  console.log('팀별 출고 건수:');
  Object.entries(byTeam).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => {
    console.log(`  ${t}: ${c}`);
  });

  // 출력 파일
  const outPath = path.join(__dirname, 'sheet-history.json');
  fs.writeFileSync(outPath, JSON.stringify(allRecords, null, 2), 'utf8');
  console.log('');
  console.log('✓ 저장:', outPath, '(' + allRecords.length + '건)');

  // inventory도 추출
  const inventory = await extractInventoryFromLatestSheet();
  const invPath = path.join(__dirname, 'sheet-inventory.json');
  fs.writeFileSync(invPath, JSON.stringify(inventory, null, 2), 'utf8');
  console.log('✓ 저장:', invPath, '(' + inventory.length + '개)');
}

main().catch(err => {
  console.error('실패:', err);
  process.exit(1);
});
