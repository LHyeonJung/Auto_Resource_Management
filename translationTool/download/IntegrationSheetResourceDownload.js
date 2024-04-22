const fs = require("fs");
const { loadIntegratedErrorCodeSpreadsheet, getPureKey, localesPath, ns, intergratedSheetId, NOT_AVAILABLE_CELL } = require("../index");
const { langs } = require("../asset/defaultInfo");

/* ==== READ ME ====
    [ 통합 오류코드 시트 다운로드 파일 실행 방법 ]
      package.json > script에 정의
          - 형태: "node {파일 경로} {다운로드 대상 언어}"
          - 예시: "node translationTool/download/SheetResourceDownload.js KO_KR"
        * 여러 다국어를 for문으로 한번에 돌리면 시트의 갱신 완료 타이밍에 따라 이전 정보가 덮어씌워지는 경우가 있어 따로 실행하게끔 방식을 변경함 (22.08.12)

    [ 통합 오류코드 시트 다운로드 전체 로직] - 리소스 관리방안 논의 후 추가 수정될 수 있음 (STATUS가 "확정"인경우 우선 다운로드)
      1. Product List 컬럼 값에 "DCC"가 포함된 ROW만 추출 

      2. (1)에서 추출된 리스트 중 DCC_Status가 "확정"인 ROW만 추출

      3. 에러코드가 존재하는 경우, 해당 Row의 ID/TYPE에 조합한 리소스 키/대상 타입 저장 (ex. Error Code ID: "err_DA_5234" / type: "DA")

       4. 다운로드 여부 체크
          (1) 기존 리소스 파일에 있는 모든 리소스 json Object로 저장
          (2) 시트의 리소스 기준으로 반복문 - 다운로드 대상 리소스 세팅
              A. [소스코드 기준 체크] 소스코드 O / 시트 X : 시트에 없는 리소스는 우선 유지 (시트상 제거되야할 리소스는 “제거 확정” 상태일때 수동으로 제거해야 함)
              B. [시트 기준 체크] 소스코드 O / 시트 O : 시트 데이터로 리소스 변경
              C. [시트 기준 체크] 소스코드 X / 시트 O : 시트 데이터로 신규 추가
                => 즉, 시트상의 리소스는 모두 우선 치환 (B+C)

       5. 위에서 추출한 리소스 키 + 리소스 목록을 리소스 파일에 저장 
		
      ## 개발자가 수동으로 해야할 부분: 해당 스크립트를 통해 자동 다운로드 후, status가 "확인(QI)/확인(Dev)/삭제" 인 리소스가 없는 상태인지 확인 
      ## status가 모두 "확정" 또는 "관리도구외"인 경우 패키징 가능
*/

const errorCodeColumnName = "Error Code"; //"No."
const productColumnName = "Product"; // "List"
const resourceColumnName = "메시지(리뉴얼)"; // "DCC_감사로그"

function isNullOrEmpty(value) {
  if (typeof value === "undefined" || value === null || value === "" || Object.keys(value).length == 0) return true;
  else return false;
}

// [시트의 type 리스트 중 DCC 리소스에 해당하는 타겟 타입 목록만 추출]
function getTargetTypes(targetTypes) {
  const ret = [];

  if (targetTypes.includes("DCC(")) {
    // DCC(A,B)의 A,B만 추출
    dccStartIndex = targetTypes.indexOf("DCC(");
    tempStr = targetTypes.substring(dccStartIndex + 4, targetTypes.length);
    dccEndIndex = tempStr.indexOf(")");
    targetTypes = tempStr.substring(0, dccEndIndex).split(",");

    targetTypes.forEach((targetType) => {
      ret.push(targetType);
    });
  }
  if (targetTypes.includes("DCC_Backend")) {
    ret.push("DCC_Backend");
  }
  return ret;
}

// [스프레드 시트 -> json]
async function fetchTranslationsFromSheetToJson(doc) {
  const sheet = doc.sheetsById[intergratedSheetId];
  if (!sheet) {
    return {};
  }

  const lngsMap = {};
  const rows = await sheet.getRows();

  // 1. Product List 컬럼 값에 "DCC"가 포함된 ROW만 추출 => 통합 오류코드 문서에서 DCC 리소스는 제외되었으니 주석처리
  var dccRows = [];
  rows.forEach((row) => {
    if (!isNullOrEmpty(row[productColumnName])) {
      // const productTypes = row[productColumnName];
      // if (productTypes.includes("DCC")) {
      //   if (row.DCC_Status == "확정") {
      //     // 2. DCC_Status가 "확정"인 ROW만 추출
      //     dccRows.push(row);
      //   }
      // }
      dccRows.push(row);
    }
  });

  /*
    3. 에러코드가 존재하는 경우, 해당 Row의 ID/TYPE에 조합한 리소스 키/대상 타입 저장 (ex. Error Code ID: "err_DA_5234" / type: "DA")
   */
  const errorCodeRow = [];
  dccRows.forEach((row) => {
    // A. 에러코드가 존재하는 row 추출
    if (!isNullOrEmpty(row[errorCodeColumnName]) && row[errorCodeColumnName] != "0") {
      let typeColumn = row[productColumnName];
      let targetTypes = typeColumn.split(",");

      if (targetTypes.length > 0) {
        var targetRow = { ...row };
        var resourceKey = "";
        var lng = lngs[0];
        if (!lngsMap[lng]) {
          lngsMap[lng] = {};
        }

        targetTypes.forEach((type) => {
          if (!isNullOrEmpty(row[resourceColumnName])) {
            switch (type.toUpperCase()) {
              case "BA-SCP":
                resourceKey = "log_BASCP_" + row[errorCodeColumnName];
                break;
              case "DA":
                resourceKey = "log_DA_" + row[errorCodeColumnName];
                break;
            }

            targetRow["Error Code ID"] = resourceKey;
            targetRow["List"] = type.toUpperCase();
            errorCodeRow.push(targetRow);
            lngsMap[lng][resourceKey] = { resource: targetRow[resourceColumnName] || "", type: type.toUpperCase(), errorCode: row[errorCodeColumnName] };
          }

          if (!isNullOrEmpty(row[resourceColumnName])) {
            switch (type.toUpperCase()) {
              case "BA-SCP":
                resourceKey = "err_BASCP_" + row[errorCodeColumnName];
                break;
              case "DA":
                resourceKey = "err_DA_" + row[errorCodeColumnName];
                break;
              case "DCC_BACKEND":
                resourceKey = "err_BACKEND_" + row[errorCodeColumnName];
                break;
            }
            targetRow["Error Code ID"] = resourceKey;
            targetRow["List"] = type.toUpperCase();
            errorCodeRow.push(targetRow);
            lngsMap[lng][resourceKey] = { resource: targetRow[resourceColumnName] || "", type: type.toUpperCase(), errorCode: row[errorCodeColumnName] };
          }
        });

        /*
      var productTypes = [];
      productTypes = getTargetTypes(row[productColumnName]);
      // 리소스 키 조합 및 세팅
      productTypes.forEach((type) => {
        var targetRow = { ...row };
        var resourceKey = "";
        var lng = lngs[0];
        if (!lngsMap[lng]) {
          lngsMap[lng] = {};
        }

        if (!isNullOrEmpty(row[resourceColumnName])) {
          switch (type.toUpperCase()) {
            case "BA-SCP":
              resourceKey = "log_BASCP_" + row[errorCodeColumnName];
              break;
            case "DA":
              resourceKey = "log_DA_" + row[errorCodeColumnName];
              break;
            case "DCC_BACKEND":
              resourceKey = "log_BACKEND_" + row[errorCodeColumnName];
              break;
          }
          targetRow["Error Code ID"] = resourceKey;
          targetRow["List"] = type.toUpperCase();
          errorCodeRow.push(targetRow);
          lngsMap[lng][resourceKey] = { resource: targetRow[resourceColumnName] || "", type: type.toUpperCase(), errorCode: row[errorCodeColumnName] };
        }

        if (!isNullOrEmpty(row[resourceColumnName])) {
          switch (type.toUpperCase()) {
            case "SCP":
              resourceKey = "err_BASCP_" + row[errorCodeColumnName];
              break;
            case "DA":
              resourceKey = "err_DA_" + row[errorCodeColumnName];
              break;
            case "DCC_BACKEND":
              resourceKey = "err_BACKEND_" + row[errorCodeColumnName];
              break;
          }
          targetRow["Error Code ID"] = resourceKey;
          targetRow["List"] = type.toUpperCase();
          errorCodeRow.push(targetRow);
          lngsMap[lng][resourceKey] = { resource: targetRow[resourceColumnName] || "", type: type.toUpperCase(), errorCode: row[errorCodeColumnName] };
        }
      });
      */
      }
    }
  });
  if (!isNullOrEmpty(dccRows)) {
    console.log("==1. 리소스 키 조합 완료==");
  }
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

// [다운로드 및 데이터 변경 여부 체크]
function statusCheck(SheetResourceMap, localeJsonFilePath, lng) {
  /*
       4. 다운로드 여부 체크
          (1) 기존 리소스 파일에 있는 모든 리소스 json Object로 저장
          (2) 시트의 리소스 기준으로 반복문 - 다운로드 대상 리소스 세팅
              A. [소스코드 기준 체크] 소스코드 O / 시트 X : 시트에 없는 리소스는 우선 유지 (시트상 제거되야할 리소스는 “제거 확정” 상태일때 수동으로 제거해야 함
              B. [시트 기준 체크] 소스코드 O / 시트 O : 시트 데이터로 리소스 변경
              C. [시트 기준 체크] 소스코드 X / 시트 O : 시트 데이터로 신규 추가
                => 즉, 시트상의 리소스는 모두 우선 치환 (B+C)
  */

  // 조건에 맞는 Row가 1개 이상일 때
  if (!isNullOrEmpty(SheetResourceMap)) {
    // 소스코드의 리소스 로드
    const keyMap = {};
    const json = fs.readFileSync(localeJsonFilePath, "utf8");
    gatherKeyMap(keyMap, lng, JSON.parse(json));
    const sourceResourceArr = Object.entries(keyMap); // 소스코드 리소스
    var sheetResourceArr = Object.entries(SheetResourceMap[lng]); // 시트의 리소스
    var resultArr = {}; // 최종적으로 리소스 파일에 덮어씌울 데이터

    // (1) 기존 리소스 파일에 있는 모든 리소스 json Object로 저장
    sourceResourceArr.forEach((element) => {
      const key = element[0];
      const resource = element[1][key][lng];
      resultArr[key] = resource;
    });

    // (2) 시트의 리소스 기준으로 반복문 - 다운로드 대상 리소스 세팅
    // [소스코드 기준 체크]
    sourceResourceArr.forEach((element) => {
      const targetObj = sheetResourceArr.filter((x) => x[0] == sourceKey);
      if (targetObj.length == 0) {
        // A. 소스코드 O / 시트 X : 시트에 없는 리소스는 우선 모두 유지 (시트상 제거되야할 리소스는 "제거확정" 상태일때 수동으로 제거해야 함)
        var sourceKey = element[0];
        const resource = element[1][sourceKey][lng];
        resultArr[sourceKey] = resource;
      }
    });

    // [시트 기준 체크]
    sheetResourceArr.forEach((sheetElement) => {
      const key = sheetElement[0];
      const sheetResource = sheetElement[1].resource;
      const targetObj = sourceResourceArr.filter((x) => x[0] == key); // 시트의 키와 동일한 키가 소스코드에도 있다면 추출
      const sourceResource = sourceResourceArr.filter((x) => x[0] == key).resource; // 소스코드에 있는 리소스의 해당 키 값

      // B+C. 시트상의 리소스는 모두 우선으로 치환
      resultArr[key] = sheetResource;
    });

    console.log("==2. 다운로드 대상 리소스 세팅 완료==");
    SheetResourceMap[lng] = resultArr;
  }
}

// [ json 파일 업데이트
async function updateJsonFromSheet() {
  const doc = await loadIntegratedErrorCodeSpreadsheet();
  const SheetResourceMap = await fetchTranslationsFromSheetToJson(doc);
  // 조건에 맞는 Row가 1개 이상일 때
  if (!isNullOrEmpty(SheetResourceMap)) {
    fs.readdir(localesPath, (error, jsFiles) => {
      if (error) {
        throw error;
      }
      lngs.forEach((lng) => {
        var localeJsonFilePath = "";
        if (lng == langs.KO) localeJsonFilePath = "lang/lang.ko.json";
        else if (lng == langs.EN) localeJsonFilePath = "lang/lang.en.json";
        else if (lng == langs.JA) localeJsonFilePath = "lang/lang.ja.json";

        statusCheck(SheetResourceMap, localeJsonFilePath, lng);

        var temp = {};
        if (lng == langs.KO) {
          if (!Object.keys(SheetResourceMap[lng]).includes("ko")) {
            temp = { ko: { ...SheetResourceMap[lng] } };
          } else {
            temp = { ...SheetResourceMap[lng] };
          }
        } else if (lng == langs.EN) {
          if (!Object.keys(SheetResourceMap[lng]).includes("en")) {
            temp = { en: { ...SheetResourceMap[lng] } };
          } else {
            temp = { ...SheetResourceMap[lng] };
          }
        } else if (lng == langs.JA) {
          if (!Object.keys(SheetResourceMap[lng]).includes("ja")) {
            temp = { ja: { ...SheetResourceMap[lng] } };
          } else {
            temp = { ...SheetResourceMap[lng] };
          }
        } else {
          temp = { ...SheetResourceMap[lng] };
        }

        const jsonString = JSON.stringify(temp, null, 2);
        fs.writeFile(localeJsonFilePath, jsonString, "utf8", (err) => {
          if (err) {
            throw err;
          }
        });
        console.log("==3. 통합 시트 리소스 다운로드 완료==");
      });
    });
  } else {
    console.log("\n==아래 조건에 부합하는 다운로드 대상 Row가 없음==\n");
    // console.log("(1) Product List 컬럼에 'DCC' 문자열 포함");
    // console.log("(2) DCC_Status 컬럼 '확정'");
    console.log("(1) Error Code 컬럼에 BA-SCP/DA 오류코드 존재");
    console.log("(2) 기존 리소스 파일에 없던 신규 오류 코드 존재");
  }
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
