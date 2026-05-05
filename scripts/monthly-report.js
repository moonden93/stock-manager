// ============================================
// monthly-report.js: 월별 보고서 발송 (수동 트리거 전용)
// ============================================
// 자동 발송은 weekly-backup.js가 매달 첫째 주 토요일에 같이 처리함.
// 이 스크립트는 과거 월 보고서를 수동으로 받고 싶을 때만 사용.
//
// 환경변수:
//   GMAIL_USER, GMAIL_APP_PASSWORD, BACKUP_RECIPIENT
//   REPORT_YEAR, REPORT_MONTH (비우면 직전월)

const nodemailer = require('nodemailer');
const { generateMonthlyReportExcel, getPreviousMonth, getMonthLabelKr } = require('./lib-monthly');

const PROJECT_ID = 'moon-dental-stock';
const DOC_PATH = 'appData/main';

async function main() {
  // 대상 월 결정
  let year = parseInt(process.env.REPORT_YEAR, 10);
  let month = parseInt(process.env.REPORT_MONTH, 10);
  if (!year || !month) {
    const prev = getPreviousMonth();
    year = prev.year;
    month = prev.month;
  }
  const yearMonth = year + '-' + String(month).padStart(2, '0');
  console.log('📊 Monthly report for', yearMonth);

  // Firestore 데이터 가져오기
  const data = await fetchFirestore();
  console.log('Fetched: inv=' + (data.inventory || []).length +
              ', hist=' + (data.history || []).length);

  if (!Array.isArray(data.inventory) || data.inventory.length === 0) {
    throw new Error('Firestore inventory가 비어있음');
  }

  // Excel 생성
  const reportBuf = generateMonthlyReportExcel(data, year, month);

  // 메일 발송
  await sendEmail(data, year, month, yearMonth, reportBuf);
  console.log('✓ Monthly report email sent');
}

// Firestore REST + 타입 파서
async function fetchFirestore() {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${DOC_PATH}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Firestore fetch ' + r.status);
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

async function sendEmail(data, year, month, yearMonth, reportBuf) {
  const monthLabel = getMonthLabelKr(year, month);  // "2026년 4월"
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const history = data.history || [];

  const monthOut = history.filter(h => {
    if (h.type !== 'out' || h.cancelled) return false;
    const d = new Date(h.date);
    return d >= monthStart && d < monthEnd;
  });
  const totalOutCost = monthOut.reduce((s, h) => s + (h.qty || 0) * (h.price || 0), 0);
  const totalOutQty = monthOut.reduce((s, h) => s + (h.qty || 0), 0);

  const message = [
    '문치과병원 재고관리 - ' + monthLabel + ' 월별 보고서',
    '═══════════════════════════════════════',
    '',
    '【 ' + monthLabel + ' 출고 통계 】',
    '· 건수: ' + monthOut.length + '건',
    '· 수량: ' + totalOutQty + '개',
    '· 금액: ' + totalOutCost.toLocaleString() + '원',
    '',
    '【 첨부파일 】',
    '· 월별보고_' + monthLabel + '.xlsx (6시트, AI 코멘트 포함)',
    '  요약 / 팀별 통계 / 업체별 통계 / TOP 품목 / 팀별 AI 분석 / 출고 원장',
    '',
    '※ 매달 첫째 주 토요일 weekly 백업 메일에 자동 첨부됩니다.',
    '※ 이 메일은 수동 트리거로 발송된 일회성 보고서입니다.'
  ].join('\n');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });

  await transporter.sendMail({
    from: '"재고관리 자동백업" <' + process.env.GMAIL_USER + '>',
    to: process.env.BACKUP_RECIPIENT || process.env.GMAIL_USER,
    subject: '[재고관리] ' + monthLabel + ' 월별보고',
    text: message,
    attachments: [
      { filename: '월별보고_' + monthLabel + '.xlsx', content: reportBuf }
    ]
  });
}

main().catch(err => {
  console.error('❌ Monthly report failed:', err);
  process.exit(1);
});
