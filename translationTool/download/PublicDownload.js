const fs = require("fs");
const { loadSpreadsheet, getPureKey, localesPath, ns, publicSheetId, NOT_AVAILABLE_CELL } = require("../index");

/*  ==== READ ME ====
    [ DCC Web Resource Management 시트 다운로드 파일 실행 방법 ]
      package.json > script에 정의
          - 형태: "node {파일 경로} {다운로드 대상 언어}"
          - 예시: "node translationTool/download/PublicDownload.js KO_KR"
        * 여러 다국어를 for문으로 한번에 돌리면 시트의 갱신 완료 타이밍에 따라 이전 정보가 덮어씌워지는 경우가 있어 따로 실행하게끔 방식을 변경함 (22.08.12)

    [다운로드 전체 로직]
      A. 소스코드/시트 간 키 정합성 체크: 
        1. [시트 기준] 시트에 있는 키인데, 소스코드에 없다면 다운로드 대상 아님  
        2. [소스코드 기준] 소스코드에 있는 키인데, 시트에 없다면 소스코드 리소스 유지(개발팀에서 리소스 추가 후, 시트에 업로드하지 않은 상태인 것)

      B. 시트의 Status를 체크하여 다운로드 여부 판단
        1. 삭제/확인(Dev)/관리대상외  인 경우, 시트의 리소스를 다운로드하지 않고 유지함  
        2. 위 3개 status가 아닌 경우, 다운로드 하여 시트와 동기화
 */

// [스프레드 시트 -> json]
async function fetchTranslationsFromSheetToJson(doc) {
  const sheet = doc.sheetsById[publicSheetId];
  if (!sheet) {
    return {};
  }

  const lngsMap = {};
  const rows = await sheet.getRows();
  rows.forEach((row) => {
    const key = row[columnKeyToHeader.key];
    lngs.forEach((lng) => {
      const translation = row[lng];
      var status = "";
      if (lng == "KO_KR") {
        status = row.KR_Status;
      } else if (lng == "EN_US") {
        status = row.EN_Status;
      } else {
        status = row.KR_Status;
      }
      // NOT_AVAILABLE_CELL("_N/A") means no related language
      if (translation === NOT_AVAILABLE_CELL) {
        return;
      }

      if (!lngsMap[lng]) {
        lngsMap[lng] = {};
      }

      lngsMap[lng][key] = { resource: translation || "", status: status };
    });
  });

  // lngsMap 형태: { 리소스 키: { resource: 리소스, status: 상태 }, ... }
  return lngsMap;
}

// [keyMap이라는 변수에 리소스 파일내 json 데이터를 Object 타입으로 변환하여 세팅 (형태: [{key:value},...])]
function gatherKeyMap(keyMap, lng, json) {
  var targetData = { ...json };
  if (lng == "KO_KR") {
    targetData = { ...json.ko };
  } else if (lng == "EN_US") {
    targetData = { ...json.en };
  }

  for (const [keyWithPostfix, translated] of Object.entries(targetData)) {
    const key = getPureKey(keyWithPostfix);
    if (!keyMap[key]) {
      keyMap[key] = {};
    }
    const keyMapWithLng = keyMap[key];
    if (!keyMapWithLng[keyWithPostfix] || keyMapWithLng[keyWithPostfix] == {}) {
      keyMapWithLng[keyWithPostfix] = lngs.reduce((initObj, lng) => {
        initObj[lng] = NOT_AVAILABLE_CELL;

        return initObj;
      }, {});
    }

    keyMapWithLng[keyWithPostfix][lng] = translated;
  }
}

// [status별로 다운로드 여부 체크]
function statusCheck(lngsMap, localeJsonFilePath, lng) {
  // 소스코드의 리소스 로드
  const keyMap = {};
  const json = fs.readFileSync(localeJsonFilePath, "utf8");
  gatherKeyMap(keyMap, lng, JSON.parse(json));
  const sourceResourceArr = Object.entries(keyMap);

  var lngArr = Object.entries(lngsMap[lng]); // 시트의 리소스
  var resultArr = {};

  // err, log 리소스의 경우 그대로 유지
  const log_err_Resorce = sourceResourceArr.filter((x) => x[0].includes("err_") || x[0].includes("log_"));
  log_err_Resorce.forEach((element) => {
    const sourceKey = element[0];
    const resource = element[1][sourceKey][lng];
    resultArr[sourceKey] = resource;
  });

  sourceResourceArr.forEach((element) => {
    const targetObj = lngArr.filter((x) => x[0] == sourceKey);
    if (targetObj.length == 0) {
      // 소스코드에는 있고, 시트에는 없는 키는 소스코드 그대로 유지
      var sourceKey = element[0];
      const resource = element[1][sourceKey][lng];
      resultArr[sourceKey] = resource;
    }
  });

  lngArr.forEach((sheetElement) => {
    const key = sheetElement[0];
    const sheetResource = sheetElement[1].resource;
    const status = sheetElement[1].status;

    // A. 시트기준 키 정합성 체크
    const targetObj = sourceResourceArr.filter((x) => x[0] == key);
    if (targetObj.length == 0) {
      // 시트에 있는 키인데, 소스코드에 없다면 다운로드 대상 아님
      return false;
    }
    // B. 시트의 Status를 체크하여 다운로드 여부 판단 후, lngsMap 재구성
    const sourceResource = sourceResourceArr.filter((x) => x[0] == key)[0][1]; // 소스코드에 있는 리소스의 해당 키 값

    switch (status) {
      case "신규":
        // 시트 리소스를 그대로 소스코드에 다운로드 (=pass)
        resultArr[key] = sheetResource;
        break;
      case "확인(QI)":
        // 시트 리소스를 그대로 소스코드에 다운로드 (=pass)
        resultArr[key] = sheetResource;
        break;
      case "확정":
        // 시트 리소스를 그대로 소스코드에 다운로드 (=pass)
        resultArr[key] = sheetResource;
        break;
      case "삭제":
        // 소스코드의 기존 리소스로 유지
        resultArr[key] = sourceResource[key][lng];
        break;
      case "확인(Dev)":
        // 소스코드 기존 리소스로 유지
        resultArr[key] = sourceResource[key][lng];
        break;
      case "관리대상외":
        // 소스코드 기존 리소스로 유지
        resultArr[key] = sourceResource[key][lng];
        break;
    }
  });
  lngsMap[lng] = resultArr;
  console.log("status별 다운로드 여부 체크 완료");
}

// [초기 실행 함수 => 리소스 파일에 최종 리소스 덮어쓰기 실행]
async function updateJsonFromSheet() {
  const doc = await loadSpreadsheet("PUBLIC", false);
  const lngsMap = await fetchTranslationsFromSheetToJson(doc);
  fs.readdir(localesPath, (error, jsFiles) => {
    if (error) {
      throw error;
    }
    lngs.forEach((lng) => {
      // const localeJsonFilePath = `${localesPath}/${lng}/${ns}.json`; **
      var localeJsonFilePath = "";
      if (lng == "KO_KR") localeJsonFilePath = "lang/lang.ko.json";
      else if (lng == "EN_US") localeJsonFilePath = "lang/lang.en.json";

      statusCheck(lngsMap, localeJsonFilePath, lng);
      var temp = {};
      if (lng == "KO_KR") {
        if (!Object.keys(lngsMap[lng]).includes("ko")) {
          temp = { ko: { ...lngsMap[lng] } };
        } else {
          temp = { ...lngsMap[lng] };
        }
      } else if (lng == "EN_US") {
        if (!Object.keys(lngsMap[lng]).includes("en")) {
          temp = { en: { ...lngsMap[lng] } };
        } else {
          temp = { ...lngsMap[lng] };
        }
      } else {
        temp = { ...lngsMap[lng] };
      }

      const jsonString = JSON.stringify(temp, null, 2);
      fs.writeFile(localeJsonFilePath, jsonString, "utf8", (err) => {
        if (err) {
          throw err;
        }
      });
      console.log("리소스 다운로드 완료");
    });
  });
}

/* [메인] */
const params = process.argv.slice(2);
const lngs = [params[0]];
const columnKeyToHeader = { key: "Key" };
if (lngs.includes("KO_KR")) {
  columnKeyToHeader.KO_KR = "KO_KR";
}
if (lngs.includes("EN_US")) {
  columnKeyToHeader.EN_US = "EN_US";
}
updateJsonFromSheet();
