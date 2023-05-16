/*
  - 업로드 시, 이전 업로드와 간격은 1분이상 두고 실행시켜야 함
  - 다운로드 시, 컬럼별 필터링에 의해 일부 row가 숨겨져 있어도 모두 다운로드 됨 확인
  - 사용할 SpreadSheet에 hyeonjung@skilful-deck-340206.iam.gserviceaccount.com 계정 공유 추가해야함
 */
const { GoogleSpreadsheet } = require("google-spreadsheet");
//구글 sheet json 키 파일
const creds = require("./.credentials/skilful-deck-340206-d919de24f478.json");
const i18nextConfig = require("../i18next-scanner.config");

const loadPath = "lang//";
const localesPath = loadPath.replace("//.json", "");
const rePluralPostfix = new RegExp(/_plural|_[\d]/g);
const NOT_AVAILABLE_CELL = "N/A"; //번역이 필요없는 부분
const ns = "translation";
const columnKeyToHeader = {
  //스프레드시트에 들어갈 header 설정
  key: "Key",
  KO_KR: "KO_KR",
  EN_US: "EN_US",
};

//#region [DCC Web Resource Management 문서 관련]

// 해당 스프레드 시트: https://docs.google.com/spreadsheets/d/1LHnZQLypttFSXKsmgXxFKFnYJXLcmK8qPTtK_dfjzA4/edit#gid=0
const spreadsheetDocId = "1LHnZQLypttFSXKsmgXxFKFnYJXLcmK8qPTtK_dfjzA4"; // 스프레드 시트의 Doc ID
const publicSheetId = 0; //구글 스프레드시트의 gid
const logSheetId = 1951955029; //구글 스프레드시트의 gid
const errorSheetId = 1065051052; //구글 스프레드시트의 gid
//#endregion

//#region [D'Amo 통합 오류코드 문서 관련]
// 해당 스프레드 시트: https://docs.google.com/spreadsheets/d/1LHnZQLypttFSXKsmgXxFKFnYJXLcmK8qPTtK_dfjzA4/edit#gid=1591246254
const integratedErrorCodeSpreadsheetDocId = "1LHnZQLypttFSXKsmgXxFKFnYJXLcmK8qPTtK_dfjzA4"; // 스프레드 시트의 Doc ID
const intergratedSheetId = 1591246254; //구글 스프레드시트의 gid
//#endregion

/* [스프레드 시트 로드] */
async function loadSpreadsheet(type = "", upload = false) {
  // eslint-disable-next-line no-console
  if (type == "PUBLIC") {
    if (upload) {
      console.info("\u001B[32m", "[Public Resource Upload]", "\u001B[0m");
    } else {
      console.info("\u001B[32m", "[Public Resource Download]", "\u001B[0m");
    }
  } else {
    console.info(
      "\u001B[32m",

      "=====================================================================================================================\n",
      "# i18next auto-sync using Spreadsheet\n\n",
      "  * Download translation resources from Spreadsheet and make /src/locales//.json\n",
      "  * Upload translation resources to Spreadsheet.\n\n",
      "=====================================================================================================================",

      "\u001B[0m"
    );
  }

  // spreadsheet key is the long id in the sheets URL
  const doc = new GoogleSpreadsheet(spreadsheetDocId);

  // load directly from json file if not in secure environment
  await doc.useServiceAccountAuth(creds);

  await doc.loadInfo(); // loads document properties and worksheets

  return doc;
}

async function loadIntegratedErrorCodeSpreadsheet() {
  // eslint-disable-next-line no-console

  console.info("\u001B[32m", "[Intergrated Error Code Spread Sheet Download]", "\u001B[0m");

  // spreadsheet key is the long id in the sheets URL
  const integratedErrorCodeDoc = new GoogleSpreadsheet(integratedErrorCodeSpreadsheetDocId);

  // load directly from json file if not in secure environment
  await integratedErrorCodeDoc.useServiceAccountAuth(creds);

  await integratedErrorCodeDoc.loadInfo(); // loads document properties and worksheets

  return integratedErrorCodeDoc;
}

function getPureKey(key = "") {
  // console.log(key);
  // return key.replace(rePluralPostfix, ''); //이렇게 하면 언더바가 2개있는 경우 하나를 제거해버림
  return key;
}

module.exports = {
  localesPath,
  loadSpreadsheet,
  loadIntegratedErrorCodeSpreadsheet,
  getPureKey,
  ns,
  creds,
  // sheetId,
  spreadsheetDocId,
  publicSheetId,
  errorSheetId,
  logSheetId,
  integratedErrorCodeSpreadsheetDocId,
  intergratedSheetId,
  columnKeyToHeader,
  NOT_AVAILABLE_CELL,
};
