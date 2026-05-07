# 자동 백업 셋업 가이드 — 매주 토요일 12시 (한국시간)

두 가지 채널로 동시에 백업됩니다:

| 채널 | 도착 위치 | 셋업 시간 |
|---|---|---|
| **GitHub Actions** | Gmail 받은편지함 (Excel 첨부) | 5분 |
| **Apps Script** | Google Drive `재고관리 백업` 폴더 (Sheets) | 10분 |

---

# 📧 GitHub Actions 셋업 (메일로 받기)

## 1단계: Gmail 앱 비밀번호 만들기

⚠️ 이건 평소 Gmail 비밀번호와 **다른 거**예요. 앱 전용 16자리 비밀번호 별도 생성.

### 1-1. 2단계 인증 활성화 (이미 켜져있으면 1-2로)

1. 주소창에 입력: **https://myaccount.google.com**
2. `moonden93@gmail.com` 로그인
3. 좌측 메뉴 **🔒 보안** 클릭
4. 스크롤해서 **"Google에 로그인하는 방법"** 섹션 찾기
5. **"2단계 인증"** 항목 상태 확인:
   - ✅ "사용 중" → 1-2로 진행
   - ❌ "사용 안 함" → 클릭해서 활성화 (휴대폰 번호 필요)

### 1-2. 앱 비밀번호 만들기

1. 주소창에 직접 입력: **https://myaccount.google.com/apppasswords**
2. **"앱 이름"** 입력칸에: `재고관리 백업`
3. **[만들기]** 클릭
4. 노란 박스에 **16자리 영문**이 나타남 (예: `abcd efgh ijkl mnop`)
5. **공백 빼고 통째로 복사** → `abcdefghijklmnop`
6. **메모장에 임시 저장** (이 화면 닫으면 다시 못 봄)

## 2단계: GitHub Secrets 등록

⚠️ **새 저장소를 만드는 게 아니라**, 기존 stock-manager 저장소의 **Settings 안**으로 들어가야 합니다.

### 2-1. Secrets 페이지로 이동

주소창에 직접 입력: **https://github.com/moonden93/stock-manager/settings/secrets/actions**

(GitHub 로그인 안 돼있으면 로그인 화면 나옴)

화면 상단에 **"Actions secrets and variables"** 제목 보여야 정확한 위치예요.

### 2-2. 첫 번째 Secret — GMAIL_USER

1. 우측 상단 **초록 [New repository secret]** 버튼 클릭
2. **Name** 칸: `GMAIL_USER` (대문자, 밑줄 정확히)
3. **Secret** 칸: `moonden93@gmail.com`
4. 아래 초록 **[Add secret]** 버튼

### 2-3. 두 번째 Secret — GMAIL_APP_PASSWORD

1. 다시 **[New repository secret]** 클릭
2. **Name** 칸: `GMAIL_APP_PASSWORD`
3. **Secret** 칸: 1-2에서 메모한 16자리 (공백 없이)
4. **[Add secret]** 클릭

화면에 두 개 다 보이면 완료:
- 🔒 GMAIL_USER (Updated now)
- 🔒 GMAIL_APP_PASSWORD (Updated now)

## 3단계: 수동 테스트

1. 주소창: **https://github.com/moonden93/stock-manager/actions**
2. 좌측 **"Weekly Backup"** 클릭
3. 우측 안내 박스의 **회색 [Run workflow ▾]** 클릭 → 펼쳐진 패널에서 **초록 [Run workflow]** 클릭
4. 페이지 새로고침 → 위쪽에 **"Weekly Backup"** 항목이 노란색(진행중) → 초록색(성공)
5. 그 항목 클릭 → 좌측 `backup` 클릭 → 진행 로그 확인
6. **약 1~2분** 후 Gmail 받은편지함에 `[재고관리] 주간 백업 ...` 메일 도착

성공하면 매주 토요일 12시에 자동 발송됩니다.

---

# 📁 Apps Script 셋업 (Drive에 저장)

## 1단계: Apps Script 프로젝트 생성

1. 주소창: **https://script.google.com**
2. `moonden93@gmail.com` 로그인
3. 좌측 상단 **파란 [+ 새 프로젝트]** 버튼 클릭
4. 새 탭 열림 → 화면 상단 **"제목 없는 프로젝트"** 글자 클릭
5. 이름 입력창 뜸 → `재고관리 자동 백업` 입력 → **확인**

## 2단계: 코드 붙여넣기

### 2-1. 기본 코드 삭제

가운데 큰 코드 편집기에 기본 코드(`function myFunction() {...}`)가 있어요:
1. 코드 영역 안 클릭
2. **Ctrl + A** (전체 선택)
3. **Delete** 키 (전부 삭제)

### 2-2. 우리 코드 가져오기

1. 새 탭에서 주소창: **https://github.com/moonden93/stock-manager/blob/main/apps-script/Code.gs**
2. 화면 우측 상단 버튼들 중 **[Raw]** 클릭
3. URL이 `raw.githubusercontent.com`으로 바뀐 페이지 → 코드만 텍스트로 보임
4. **Ctrl + A** → **Ctrl + C** (전체 복사)

### 2-3. Apps Script에 붙여넣기

1. Apps Script 탭으로 돌아가기
2. 빈 코드 편집기 클릭 → **Ctrl + V** (붙여넣기)
3. 상단 **💾 저장** 아이콘 클릭 (또는 Ctrl+S)

## 3단계: 시간대 확인 (한국시간으로)

1. 좌측 메뉴 **⚙️ 프로젝트 설정** 클릭
2. **"시간대"** 항목이 `(GMT+09:00) Seoul`인지 확인
3. 아니면 드롭다운 클릭 → "Seoul" 검색 → 선택

## 4단계: 첫 수동 실행 + 권한 승인

1. 좌측 메뉴 **`</>` 편집기** 클릭 (코드 화면)
2. 코드 위쪽에 **함수 선택 드롭다운** 보임
3. 드롭다운에서 **`weeklyBackup`** 선택
4. **▶ 실행** 버튼 클릭

### 권한 승인 팝업 (처음 한 번만)

1. **"권한 검토"** 버튼 클릭
2. Google 계정 선택 (`moonden93@gmail.com`)
3. **"Google에서 확인하지 않은 앱입니다"** 빨간 경고 화면
4. 좌측 하단 **"고급"** 글자 클릭 (작게 있음)
5. 아래 새로 나타난 **"재고관리 자동 백업(안전하지 않음)으로 이동"** 링크 클릭
6. 권한 항목 화면 → 맨 아래 **[허용]** 클릭

### 실행 결과 확인

자동으로 코드 실행됨. 하단 **"실행 로그"** 패널에 다음과 같이 떠야 성공:
```
📅 Backup starting at ...
Fetched: inv=568, hist=1432, req=1
✓ 백업 완료 — Drive 폴더: 재고관리 백업
```

## 5단계: Drive 결과 확인

1. 주소창: **https://drive.google.com**
2. 화면에 **"재고관리 백업"** 폴더가 새로 생겨있음 (없으면 새로고침)
3. 폴더 더블클릭 → 안의 항목들:
   - 📊 `보고용_2026-05-09` (초록색 Sheets)
   - 📊 `재난백업용_2026-05-09` (초록색 Sheets)
4. Sheets 더블클릭하면 그대로 열림. **Excel(.xlsx)로 다운로드**: 파일 → 다운로드 → Microsoft Excel

## 6단계: 매주 토요일 자동 트리거 등록

1. Apps Script 탭으로 돌아가기
2. 좌측 메뉴 **⏰ 트리거** 클릭
3. 화면 우하단 **파란 [+ 트리거 추가]** 클릭
4. 작은 창 설정:
   - **실행할 함수 선택**: `weeklyBackup`
   - **실행할 배포 선택**: `Head` (기본값)
   - **이벤트 소스 선택**: `시간 기반`
   - **시간 기반 트리거 유형 선택**: **`주 단위 타이머`**
   - **요일 선택**: **`매주 토요일`**
   - **시간 선택**: `오후 12시 - 오후 1시`
   - **장애 알림 설정**: `매일 알림` (실패 시 메일로 알려줌)
5. 우하단 **[저장]** 클릭

이제 매주 토요일 12-1시 사이에 Google 서버가 자동 실행 (PC/폰 무관).

---

# ✅ 최종 확인

다음 토요일 12시 이후:

| 채널 | 어디서 확인 |
|---|---|
| **메일** | Gmail 받은편지함 → `[재고관리] 주간 백업 YYYY-MM-DD` |
| **Drive Sheets** | `재고관리 백업/보고용_*`, `재고관리 백업/재난백업용_*` |

---

# 🛟 문제 해결

## GitHub Actions가 실패할 때

1. https://github.com/moonden93/stock-manager/actions → 실패한 실행 클릭
2. `backup` 단계 펼쳐서 빨간 X 항목의 로그 확인
3. 흔한 원인:
   - **`Invalid login`** → Gmail 앱 비밀번호 오타 (16자리 정확히 입력했는지)
   - **`secret not found`** → GMAIL_USER, GMAIL_APP_PASSWORD 이름 오타
   - **`Firestore fetch 401`** → Firestore 보안 규칙 변경됨 (드물게)

## Apps Script가 실패할 때

1. script.google.com → 좌측 메뉴 **"실행"** 클릭
2. 최근 실행 결과 → 빨간 ❌ 항목 클릭
3. 흔한 원인:
   - **권한 만료** → 다시 ▶ 실행해서 재승인
   - **트리거 미등록** → 6단계 다시 확인

## 둘 다 안 와도 안전망

- 사이트 콘솔에서 즉시 다운로드:
  ```js
  mcDownloadReportNow();    // 보고용 Excel
  mcDownloadRecoveryNow();  // 재난백업용 Excel
  ```
- Firebase Firestore에 데이터는 살아있음 (백업이 안 와도 데이터 손실 아님)

---

# 📝 변경/유지보수 시

## 백업 시간/요일 바꾸려면

- **GitHub Actions**: `.github/workflows/weekly-backup.yml`의 `cron` 값 수정 후 push
  - `'0 3 * * 6'` → 토요일 03:00 UTC = 토요일 12:00 KST
  - cron 도우미: https://crontab.guru
- **Apps Script**: 트리거 페이지에서 기존 트리거 삭제 → 새로 추가

## 받는 이메일 추가/변경

- GitHub Secrets에 `BACKUP_RECIPIENT` 추가 (기본은 GMAIL_USER로 발송)
- 여러 명에게 보내려면 쉼표로 구분: `a@x.com,b@y.com`
