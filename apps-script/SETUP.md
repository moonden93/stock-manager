# 자동 백업 셋업 가이드

매일 12시(한국시간) 자동 백업 — **두 가지 채널**:

| 채널 | 도착 위치 | 셋업 시간 |
|---|---|---|
| **GitHub Actions** | `moonden93@gmail.com` (Excel 첨부) | 5분 |
| **Apps Script** | Google Drive `재고관리 백업` 폴더 | 10분 |

---

## 1. GitHub Actions 셋업 (메일로 받기)

### 1-1. Gmail 앱 비밀번호 만들기

1. https://myaccount.google.com/security 접속
2. **"2단계 인증"** 활성화 (안 켜져 있으면)
3. **"앱 비밀번호"** 클릭 (또는 https://myaccount.google.com/apppasswords)
4. 앱 이름: `재고관리 백업` 입력 → 생성
5. 화면에 뜨는 **16자리 비밀번호** 복사 (공백 빼고: 예 `abcdefghijklmnop`)

### 1-2. GitHub Secrets에 등록

1. https://github.com/moonden93/stock-manager/settings/secrets/actions 접속
2. **"New repository secret"** 클릭, 다음 두 개 등록:

| Name | Value |
|---|---|
| `GMAIL_USER` | `moonden93@gmail.com` |
| `GMAIL_APP_PASSWORD` | (위에서 만든 16자리, 공백 없이) |

(선택) `BACKUP_RECIPIENT` — 다른 이메일로 보내고 싶으면 등록. 없으면 GMAIL_USER로 발송.

### 1-3. 테스트 (수동 실행)

1. https://github.com/moonden93/stock-manager/actions 접속
2. 왼쪽 **"Daily Backup"** 클릭
3. 우측 상단 **"Run workflow"** 버튼 → **"Run workflow"** (default branch)
4. 1~2분 후 메일 도착 확인

성공하면 매일 12시(KST)에 자동 발송됩니다.

---

## 2. Apps Script 셋업 (Drive에 저장)

### 2-1. 스크립트 생성

1. https://script.google.com 접속 (Google 로그인)
2. **"새 프로젝트"** 클릭
3. 좌상단 프로젝트 이름 클릭 → `재고관리 자동 백업`으로 변경
4. 기본 코드 모두 삭제
5. [Code.gs](Code.gs) 파일 내용을 복사해서 붙여넣기
6. 💾 저장 (Ctrl+S)

### 2-2. 시간대 확인

1. 좌측 메뉴 ⚙️ **프로젝트 설정** 클릭
2. **시간대**가 `(GMT+09:00) Seoul`인지 확인 (아니면 변경)

### 2-3. 첫 수동 실행 + 권한 승인

1. 좌측 메뉴 **"편집기"** (`</>`)로 돌아가기
2. 상단 함수 선택 드롭다운에서 **`dailyBackup`** 선택
3. **▶ 실행** 클릭
4. 처음에 권한 승인 요청 뜸:
   - **"승인 검토"** 클릭
   - Google 계정 선택
   - "이 앱은 Google에서 확인하지 않았습니다" 경고 → **"고급"** → **"재고관리 자동 백업(안전하지 않음)으로 이동"** 클릭
   - 권한 항목 확인 (Drive, 외부 URL 접근) → **"허용"** 클릭
5. 실행 완료 후 좌하단 **"실행 로그"**에 `✓ 백업 완료` 메시지 확인

### 2-4. 결과 확인

[Google Drive](https://drive.google.com) 접속 → **"재고관리 백업"** 폴더 → 두 파일 확인:
- `보고용_2026-05-03` (Google Sheets)
- `재난백업용_2026-05-03` (Google Sheets)

각 파일 더블클릭하면 Sheets로 열림. Excel(.xlsx)로 다운로드하려면: 파일 → 다운로드 → Microsoft Excel(.xlsx)

### 2-5. 매일 자동 실행 트리거 등록

1. 좌측 메뉴 ⏰ **트리거** 클릭
2. 우하단 **"+ 트리거 추가"** 클릭
3. 다음과 같이 설정:
   - **실행할 함수**: `dailyBackup`
   - **이벤트 소스**: `시간 기반`
   - **트리거 유형**: `일 단위 타이머`
   - **시간 선택**: `오후 12시 - 오후 1시`
4. **저장**

이제 매일 12시 한국시간에 자동 실행됩니다 (PC 안 켜져 있어도 Google 서버에서 실행).

---

## 3. 두 채널 모두 작동하는지 확인

내일 12시 이후에:
- **메일함**: `[재고관리] 일일 백업 2026-MM-DD` 메일 (첨부 2개)
- **Drive**: `재고관리 백업` 폴더에 `보고용_*`, `재난백업용_*` 파일 2개

둘 다 도착하면 셋업 완료. 둘 중 하나만 와도 한쪽 백업은 정상 작동.

---

## 문제 해결

### GitHub Actions 실패
- Actions 탭 → 실패한 실행 클릭 → 로그 확인
- 흔한 원인: Gmail 앱 비밀번호 오타, 2단계 인증 미활성화, Secrets 이름 오타

### Apps Script 실패
- script.google.com → 좌측 **"실행"** 메뉴 → 최근 실행 결과 확인
- 흔한 원인: 권한 미승인, 트리거 미등록, Firestore 접근 차단

### 둘 다 실패해도 안전망
- 사이트 콘솔에서 `mcDownloadReportNow()`, `mcDownloadRecoveryNow()`로 즉시 수동 다운로드 가능
