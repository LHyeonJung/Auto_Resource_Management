const fs = require("fs");
const utilFunc = require("../asset/utilFunc");
const { loadSpreadsheet, getPureKey, localesPath, ns, logSheetId, NOT_AVAILABLE_CELL, isNullOrEmpty } = require("../index");
const { langs } = require("../asset/defaultInfo");

/*  ==== READ ME ====
    [ DCC Web Resource Management 시트 다운로드 파일 실행 방법 ]
      package.json > script에 정의
          - 형태: "node {파일 경로} {다운로드 대상 언어}"
          - 예시: "node translationTool/download/LogDownload.js KO_KR"
        * 여러 다국어를 for문으로 한번에 돌리면 시트의 갱신 완료 타이밍에 따라 이전 정보가 덮어씌워지는 경우가 있어 따로 실행하게끔 방식을 변경함 (22.08.12)

    [다운로드 전체 로직]
      A. 소스코드/시트 간 키 정합성 체크: 
        1. [시트 기준] 시트에 있는 키인데, 소스코드에 없는 경우 PASS
        2. [소스코드 기준] 소스코드에 있는 키인데, 시트에 없다면 소스코드 리소스 유지(개발팀에서 리소스 추가 후, 시트에 업로드하지 않은 상태인 것)

      B. 시트의 Status를 체크하여 다운로드 여부 판단
        1. ‘확정’인 경우만 시트 리소스 다운로드
        2. 그 외의 경우 기존 소스코드 리소스로 유지
 */

// [스프레드 시트 -> json]
async function fetchTranslationsFromSheetToJson(doc) {
  const sheet = doc.sheetsById[logSheetId];
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
      if (lng == langs.KO) {
        status = row.KR_Status;
      } else if (lng == langs.EN) {
        status = row.EN_Status;
      } else if (lng == langs.JA) {
        status = row.JA_Status;
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
  if (lng == langs.KO) {
    targetData = { ...json.ko };
  } else if (lng == langs.EN) {
    targetData = { ...json.en };
  } else if (lng == langs.JA) {
    targetData = { ...json.ja };
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

  // public, error 리소스의 경우 그대로 유지
  const public_err_Resorce = sourceResourceArr.filter((x) => !x[0].includes("log_"));
  public_err_Resorce.forEach((element) => {
    const key = element[0];
    const resource = element[1][key][lng];
    resultArr[key] = resource;
  });

  sourceResourceArr.forEach((element) => {
    const targetObj = lngArr.filter((x) => x[0] == sourceKey);
    // [A. 소스코드 기준 키 정합성 체크]

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

    // [B. 시트기준 키 정합성 체크]
    const targetObj = sourceResourceArr?.filter((x) => x[0] == key);
    if (targetObj.length == 0) {
      // 시트에 있는 키인데, 소스코드에 없다면
      if (sourceResourceArr.length == 0) {
        // 소스코드에 해당 언어 리소스가 0개라면, 시트의 리소스를 소스코드로 모두 다운로드 (언어 첫 지원 시)
        resultArr[key] = sheetResource;
      } else {
        // 다운로드 대상 아님
        return false;
      }
    }

    // [C. 시트의 Status를 체크하여 다운로드 여부 판단 후, lngsMap 재구성]
    const sourceResource = sourceResourceArr?.filter((x) => x[0] == key)?.[0]?.[1]; // 소스코드에 있는 리소스의 해당 키 값

    // if (!isNullOrEmpty(sourceResource)) {
    // } // ==> 이거 안들어가도될지 확인 필요 ***
    if (!utilFunc.isNullOrEmpty(sourceResource))
      switch (status) {
        case "신규":
          // 소스코드 기존 리소스로 유지 (pass) => 소스코드에서 올린 후 검수되지 않은 리소스이므로 가져오지 않음
          resultArr[key] = sourceResource[key][lng];
          break;
        case "확인(QI)":
          // 소스코드 기존 리소스로 유지 (pass) => 소스코드에서 올린 후 검수되지 않은 리소스이므로 가져오지 않음
          resultArr[key] = sourceResource[key][lng];
          break;
        case "확인(GL)":
          // 소스코드 기존 리소스로 유지 (pass) => 소스코드에서 올린 후 검수되지 않은 리소스이므로 가져오지 않음
          resultArr[key] = sourceResource[key][lng];
          break;
        case "확정":
          // 시트 리소스를 그대로 소스코드에 다운로드
          resultArr[key] = sheetResource;
          break;
        case "삭제":
          // 소스코드의 기존 리소스로 유지 (pass)
          resultArr[key] = sourceResource[key][lng];
          break;
        case "확인(Dev)":
          // 소스코드 기존 리소스로 유지 (pass)
          resultArr[key] = sourceResource[key][lng];
          break;
        case "관리대상외":
          // 소스코드 기존 리소스로 유지 (pass)
          resultArr[key] = sourceResource[key][lng];
          break;
        default: // 소스코드 기존 리소스로 유지
          resultArr[key] = sourceResource[key][lng];
          break;
      }
  });
  lngsMap[lng] = resultArr;
  console.log("키 정합성 체크 및 status별 다운로드 여부 체크 완료");
}

// [초기 실행 함수 => 리소스 파일에 최종 리소스 덮어쓰기 실행]
async function updateJsonFromSheet() {
  const doc = await loadSpreadsheet("LOG", false);
  const lngsMap = await fetchTranslationsFromSheetToJson(doc);
  fs.readdir(localesPath, (error, jsFiles) => {
    if (error) {
      throw error;
    }
    lngs.forEach((lng) => {
      // const localeJsonFilePath = `${localesPath}/${lng}/${ns}.json`; **
      var localeJsonFilePath = "";
      if (lng == langs.KO) localeJsonFilePath = "lang/lang.ko.json";
      else if (lng == langs.EN) localeJsonFilePath = "lang/lang.en.json";
      else if (lng == langs.JA) localeJsonFilePath = "lang/lang.ja.json";

      statusCheck(lngsMap, localeJsonFilePath, lng);
      var temp = {};
      if (lng == langs.KO) {
        if (!Object.keys(lngsMap[lng]).includes("ko")) {
          temp = { ko: { ...lngsMap[lng] } };
        } else {
          temp = { ...lngsMap[lng] };
        }
      } else if (lng == langs.EN) {
        if (!Object.keys(lngsMap[lng]).includes("en")) {
          temp = { en: { ...lngsMap[lng] } };
        } else {
          temp = { ...lngsMap[lng] };
        }
      } else if (lng == langs.JA) {
        if (!Object.keys(lngsMap[lng]).includes("ja")) {
          temp = { ja: { ...lngsMap[lng] } };
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
if (lngs.includes(langs.KO)) {
  columnKeyToHeader.KO_KR = langs.KO;
}
if (lngs.includes(langs.EN)) {
  columnKeyToHeader.EN_US = langs.EN;
}
if (lngs.includes(langs.JA)) {
  columnKeyToHeader.JA_JP = langs.JA;
}
updateJsonFromSheet();
