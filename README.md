# Auto_Resource_Management

[google-spreadsheet, googleapis 모듈 기반] 리소스와 스프레드 시트 간의 자동 업/다운로드를 실행하기 위한 소스코드

<전제 상황>

- 제품 내에서 사용하는 언어별 리소스를 구글 스프레드 시트로 관리하고 있음 (각 리소스는 수정/반영 여부 등을 status 컬럼을 통해 구분하고 있음)
- 각 시트에는 Key, KO_KR, KR_Status 라는 이름의 컬럼이 존재해야 함 (일문, 영문까지 추가 시 컬럼 추가 및 소스코드 반영 필요)
- 스프레드 시트 권한 키를 발급받은 계정을 해당 스프레드 시트 공유자에 추가해두어야 함 (편집자)
  ㄴhyeonjung@skilful-deck-340206.iam.gserviceaccount.com

<스프레드 시트 예시>

- 업/다운로드 테스트: https://docs.google.com/spreadsheets/d/1LHnZQLypttFSXKsmgXxFKFnYJXLcmK8qPTtK_dfjzA4/edit#gid=0
- 다운로드 테스트:

<구현 목적>
다음과 같은 작업을 수동으로 진행하면서 느꼈던 불편함을 해소하기 위해 업/다운로드를 자동화함 1) 해당 시트의 최신 리소스와 status의 갱신이 필요한 경우 2) 시트내에서 수정된 내용을 status별로 구별하여 소스코드에 반영이 필요한 경우

<조건>

1.  status는 아래와 같이 구분되어 있음

    1. "신규": 기존에 없던 리소스가 새로 추가된 경우
    2. "확인(QI/GL)": 품질부 검토가 필요한 경우
    3. "확인(Dev)": 품질부에서 개발부 검토를 요청한 경우
    4. "확정": 개발부/품질부에서 모두 합의 완료된 경우 → 소스코드에 바로 반영하면 되는 상태
    5. "삭제": 개발부/품질부 검토 결과 삭제가 필요한 경우
    6. "관리대상외": 품질부 검토 대상이 아닌 경우 (특정 라이브러리에서 고정하여 쓰는 값 등)
    7. (공백): 개발부/품질부 검토 완료 및 소스코드에 반영 완료된 경우

2.  리소스 종류는 다음과 같이 구분되어 시트별로 분리되어져 있음 1) "PUBLIC" : 전 범위에서 사용되는 리소스 2) "LOG": 로그 기록용으로 사용되는 리소스 3) "ERROR": 에러 메시지 출력용으로 사용되는 리소스

- 해당 소스코드 사용 방법
  1.  소스코드 → 스프레드 시트로 업로드 할 때 명령어
      1. PUBLIC: "yarn dccPublicResourceUpload:i18n"
      2. LOG: "yarn dccLogResourceUpload:i18n"
      3. ERROR: "dccErrorResourceUpload:i18n"
  2.  스프레드 시트 → 소스코드로 다운로드 할 때 명령어
      1. PUBLIC: dccPublicResourceDownload:i18n
      1. LOG: (구현 필요)
      1. ERROR: (구현 필요)

<PUBLIC/LOG/ERROR 리소스 업로드 실행> 1) package.json 에 정의해둔 명령어 사용
ex) $ yarn dccPublicResourceUpload:i18n 2) 명령어 직접 실행: "node translationTool/upload/{업로드 대상 파일명}.js {언어} {리소스 컬럼} {상태 컬럼}"
ex) $ node translationTool/upload/PublicUpload.js KO_KR B C

<PUBLIC/LOG/ERROR 리소스 다운로드 실행> 1) package.json 에 정의해둔 명령어 사용
ex) $ yarn dccPublicResourceDownload:i18n 2) 명령어 직접 실행: "node translationTool/upload/{다운로드 대상 파일명}.js {언어}"
ex) $ node translationTool/download/LogDownload.js KO_KR

<통합 시트 리소스 다운로드 실행> - 해당 시트는 제품 타입+에러코드를 조합하여 리소스 키를 만들고, 메시지를 값으로 매칭하여 다운로드 하는 소스코드임 - 전제: errorCodeColumnName, productColumnName, resourceColumnName를 컬럼명과 동일하게 세팅한 후 실행해야 한다. 1) package.json 에 정의해둔 명령어 사용
ex) $ yarn integratedErrorCodeDownload:i18n 2) 명령어 직접 실행: "node translationTool/upload/{통합 다운로드 파일명}.js {언어}"
ex) $ node translationTool/download/IntegrationSheetResourceDownload.js KO_KR
