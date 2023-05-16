const fs = require("fs");
require("dotenv").config();

const { loadSpreadsheet, localesPath, getPureKey, ns, creds, spreadsheetDocId, errorSheetId, NOT_AVAILABLE_CELL } = require("../index");

/* ==== READ ME ====
    [ 업로드 파일 위치 ]
      (DCC Web Resource Management 시트)
      ../index.js 파일내의 DCC Web Resource Management 문서 관련> spreadsheetDocId, errorSheetId 참조

    [ 업로드 파일 실행 방법 ]
      package.json > script에 정의
          - 형태: "node {업로드파일 경로} {업로드 대상 언어} {대상 리소스 컬럼 번호} {대상 Status 컬럼 번호}"
          - 예시:  "dccErrorResourceUpload:i18n": "node translationTool/upload/ErrorUpload.js KO_KR D H",
        * 여러 다국어를 for문으로 한번에 돌리면 시트의 갱신 완료 타이밍에 따라 이전 정보가 덮어씌워지는 경우가 있어 따로 실행하게끔 방식을 변경함 (22.08.12)

    [ ERROR 업로드 전체 로직]
      [소스코드-시트간 키 정합성 체크]
          1. [시트 기준] 시트에 있는 키 목록과 소스코드의 키 목록 비교
                A. 시트 O, 소스코드 O
                    : pass
                B. 시트 O, 소스 코드 X
                    (1) status가 "삭제"이라면, 개발부에서 확인 후 제거한 리소스 이므로 시트에서도 제거
                    (2) status가 "삭제"이 아니라면, pass (일단 정합성이 안맞는 상태로 둠 => 추가 요청 리소스라면 차후에 개발부에서 확인 후 소스코드에 추가하면 "확인(QI)" 로 올라갈것임)  			

          2. [소스코드 기준] 소스코드에 있는 키 목록과 시트의 키 목록 비교
                A. 소스코드 O, 시트 O 
                    : pass 
                B. 소스코드 O, 시트 X
                    : 시트에 리소스 추가 + status는 "신규"

      [중복 키가 존재하는 경우, status별로 값을 비교하여 업로드 결정]
                A. 시트-리소스간 값이 동일하지 않음 
                    1. status가 "신규": 값만 소스코드 기준으로 변경  
                    2. status가 "확인(QI)": 값만 소스코드 기준으로 변경  
                    3. status가 "확인(Dev)" : status "확인(QI)"로 변경 + 값은 소스코드 기준으로 변경 (= GL팀에서 확인요청 이후 개발팀에서 소스코드를 변경한 경우)
                    4. status가 "확정": pass (= 개발부에서 확정 리소스를 소스코드에 다운로드(반영)하지 않은 상태인 것)
                    5. status가 "삭제": 값만 소스코드 기준으로 변경 (= 개발부에서 아직 키가 제거되지 않은 상태인 것)  
                    6. status가 "관리대상외": 값만 소스코드 기준으로 변경
                    7. status가 "" (공백): status "확인(QI)"로 변경 + 값은 소스코드 기준으로 변경 (= 제품에 반영한 이후 다시 리소스가 변경된 경우) 

                B. 시트와 리소스 값이 동일함
                  : pass
                      1. status가 "확인(QI)": pass (아직 GL팀 검토 이전인 경우) 
                      2. status가 "확인(Dev)" : pass (아직 개발팀에서 검토/수정이 이루어지지 않은 상태인 경우) 
                      3. status가 "확정": pass (검토 완료된 리소스가 소스코드에 반영된 상태)
                      4. status가 "삭제": pass (아직 개발팀에서 검토/제거가 이루어지지 않은 상태인 경우) 
                      5. status가 "관리대상외": pass
                      6. status가 "" (공백): pass  (제품에 반영된 후 변경된적 없는 경우)  


    * 확인(Dev), 삭제 status의 경우 수동 확인이 필요함
        ㄴ확인(Dev)로 추가요청된 리소스의 경우, 개발부에서 검토 후 소스코드에 추가+status 변경(확인(QI)) 해두어야 함 => 수동
          ===> 이거까지 자동화 되려면 "추가요청"이라는 status가 따로 필요함
    * 패키지 나갈때는 status에 "확정"/"관리대상외"만 남아있어야 함 ("삭제"는 남아있어도 상관은 없음 = 아직 삭제 검토가 좀 더 필요한 경우)
    * 패키지 배포 후, "확정"인 status는 모두 공백으로 변경
 */

const { google } = require("googleapis");
let jwtClient = new google.auth.JWT(creds.client_email, null, creds.private_key, ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/calendar"]);

//authenticate request
jwtClient.authorize(function (err, tokens) {
  if (err) {
    console.log(err);
    return;
  } else {
    // console.log("Successfully connected!");
  }
});

// [키 정합성 체크]
async function consistencyCheck(doc, keyMap) {
  /*
    [소스코드-시트간 키 정합성 체크]
      1. [시트 기준] 시트에 있는 키 목록과 소스코드의 키 목록 비교
		    A. 시트 O, 소스코드 O
			    : pass
        B. 시트 O, 소스 코드 X
		      (1) status가 "삭제"이라면, 개발부에서 확인 후 제거한 리소스 이므로 시트에서도 제거
		      (2) status가 "삭제"이 아니라면, pass (일단 정합성이 안맞는 상태로 둠 => 추가 요청 리소스라면 차후에 개발부에서 확인 후 소스코드에 추가하면 "확인(QI)" 로 올라갈것임)  			

   	  2. [소스코드 기준] 소스코드에 있는 키 목록과 시트의 키 목록 비교
        A. 소스코드 O, 시트 O 
			    : pass 
        B. 소스코드 O, 시트 X
			    : 시트에 리소스 추가 + status는 "신규"
   */

  let sheet = doc.sheetsById[errorSheetId];
  let rows = await sheet.getRows();
  var removeKeysIndex = []; // 제거 대상 row의 인덱스 모음
  var isChangeValue = false;
  changedRows = [...rows];

  // [1. 시트의 키/값 기준으로 소스코드 상에도 있는지 체크]
  var i = 1;
  rows.forEach(async (row) => {
    i += 1;
    const key = row[columnKeyToHeader.key];

    // A. 시트 O, 소스코드 O
    if (keyMap[key]) {
      // PASS
    }

    // B. 시트 O, 소스코드 X
    else {
      /*
        B-1. status가 "삭제"이라면, 개발부에서 확인 후 제거한 리소스 이므로 시트에서도 제거
        B-2. status가 "삭제"이 아니라면, pass (일단 정합성이 안맞는 상태로 둠 => 추가 요청 리소스라면 차후에 개발부에서 확인 후 소스코드에 추가하면 "확인(QI)" 로 올라갈것임)
      */
      if (row[`KR_Status`] == "삭제") {
        removeKeysIndex.push(i - 1);
      } else {
        // PASS
      }
    }
  });

  // [제거 대상 row 제거]
  if (removeKeysIndex.length > 0) {
    await rowBatchDelete(removeKeysIndex);
    await deleteRow(sheet, removeKeysIndex); // changedRows 변수에서 제거된 리소스 제거 처리
  }

  // [batch update]
  if (isChangeValue) {
    console.log("키 정합성 체크 결과 시트에 반영");
    await rowBatchUpdate();
  }

  //[시트 다시 로드]
  sheet = doc.sheetsById[errorSheetId];
  rows = await sheet.getRows();

  // [시트에 현재 존재하는 키만 모음]
  var sheetRowKeys = []; // 시트에 존재하는 키 모음
  rows.forEach((row) => {
    const key = row[columnKeyToHeader.key];
    sheetRowKeys.push(key);
  });

  // [2. 소스코드의 키/값 기준으로 체크]
  var addedRows = []; // 시트에 추가할 Rows

  for (const [key, translations] of Object.entries(keyMap)) {
    // A. 소스코드 O, 시트 O
    if (sheetRowKeys.includes(key)) {
      // PASS
    }

    // B. 소스코드 O, 시트 X: 신규 추가
    else {
      const row = {
        [columnKeyToHeader.key]: key,
        ...Object.keys(translations).reduce((result, lng) => {
          const header = columnKeyToHeader[lng];
          result[header] = translations[lng];

          if (lng == "KO_KR") {
            result[`KR_Status`] = "신규";
          } else if (lng == "EN_US") {
            result[`EN_Status`] = "신규";
          } else {
            result[`KR_Status`] = "신규";
          }
          return result;
        }, {}),
      };
      addedRows.push(row);
    }
  }

  // [upload new keys]
  if (addedRows.length > 0) {
    await sheet.addRows(addedRows);
  }
  console.log("==1. ERROR 키 정합성 체크 완료==");
}

// [대상 시트가 없는 경우, 새로 생성]
async function addNewSheet(doc, title, errorSheetId) {
  const headerValues = ["Key", "KO_KR", "EN_US"];
  const sheet = await doc.addSheet({
    errorSheetId,
    title,
    headerValues,
  });

  return sheet;
}

var changedRows = [];
var sheetName = "";
// [리소스 업로드 전체 로직 (키 정합성 체크 + 리소스 업로드)]
async function updateTranslationsFromKeyMapToSheet(doc, keyMap) {
  try {
    var dccVersion = process.env.REACT_APP_SERVICE_VERSION;
    sheetName = "v" + dccVersion + "[ERROR]";

    //시트 타이틀
    const title = "DCC Web Resource Management";
    let sheet = doc.sheetsById[errorSheetId];

    // 시트명 - 현재 DCC 버전으로 변경
    await sheet.updateProperties({ title: sheetName });

    // 소스코드-시트간 키 정합성 체크
    await consistencyCheck(doc, keyMap);

    if (!sheet) {
      sheet = await addNewSheet(doc, title, errorSheetId);
    }

    const rows = await sheet.getRows();
    changedRows = [...rows];

    // find exist keys
    const existKeys = {};
    const addedRows = [];
    const existRows = [];

    rows.forEach((row) => {
      const key = row[columnKeyToHeader.key];
      if (keyMap[key]) {
        existKeys[key] = true;
        existRows.push(row);
      }
    });

    //스프레트시트에 row 넣는 부분
    for (const [key, translations] of Object.entries(keyMap)) {
      if (!existKeys[key]) {
        // 동일키가 시트에 존재하지 않는 경우 => 키 정합성을 맞춘 이후 실행하는 것이므로 이 경우는 없어야 함 (혹시나 누락된 경우 신규 추가)
        const row = {
          [columnKeyToHeader.key]: key,
          ...Object.keys(translations).reduce((result, lng) => {
            const header = columnKeyToHeader[lng];
            result[header] = translations[lng];

            if (lng == "KO_KR") {
              result[`KR_Status`] = "신규";
            } else if (lng == "EN_US") {
              result[`EN_Status`] = "신규";
            } else {
              result[`KR_Status`] = "신규";
            }

            return result;
          }, {}),
        };
        addedRows.push(row);
      } else {
        // 동일 키가 시트에 이미 존재
        /*
          [중복 키가 존재하는 경우, STATUS별로 값을 비교하여 업로드 결정]
            A. 시트-리소스간 값이 동일하지 않음
               1. status가 "신규": 값만 소스코드 기준으로 변경  
          		 2. status가 "확인(QI)": 값만 소스코드 기준으로 변경  
               3. status가 "확인(Dev)" : status "확인(QI)"로 변경 + 값은 소스코드 기준으로 변경 (= GL팀에서 확인요청 이후 개발팀에서 소스코드를 변경한 경우)
               4. status가 "확정": pass (= 개발부에서 최신 리소스를 소스코드에 다운로드(반영)하지 않은 상태인 것)
            	 5. status가 "삭제": 값만 소스코드 기준으로 변경 (= 개발부에서 아직 키가 제거되지 않은 상태인 것)  
		           6. status가 "관리대상외": 값만 소스코드 기준으로 변경
 		           7. status가 "" (공백): status "확인(QI)"로 변경 + 값은 소스코드 기준으로 변경 (= 제품에 반영한 이후 다시 리소스가 변경된 경우) 

            B. 시트와 리소스 값이 동일함
              : PASS
        */
        var resourceArr = Object.entries(translations);
        resourceArr.forEach(async (element) => {
          var targetRow = existRows.filter((row) => row.Key == key)[0]; // 시트 데이터
          var lngType = element[0];
          var targetStatus = "";
          if (lngType == "KO_KR") {
            targetStatus = targetRow.KR_Status;
          } else if (lngType == "EN_US") {
            targetStatus = targetRow.EN_Status;
          } else {
            targetStatus = targetRow.KR_Status;
          }
          var isSame = targetRow[element[0]] == element[1];

          //  A. 시트-리소스간 값이 동일하지 않음
          if (!isSame) {
            switch (targetStatus) {
              case "": // 빈값이면 "" 에 해당하는지부터 체크
                await changeRow(lngType, keyMap, key, "확인(QI)", true); // status 비어있으면 채워주기 => 패키지에 반영된 이후 다시 리소스가 변경된 경우
                break;
              case undefined:
                await changeRow(lngType, keyMap, key, "확인(QI)", true); // status 비어있으면 채워주기 => 패키지에 반영된 이후 다시 리소스가 변경된 경우
                break;
              case "신규":
                await changeRow(lngType, keyMap, key, "", true);
                break;
              case "확인(QI)":
                await changeRow(lngType, keyMap, key, "", true);
                break;
              case "확인(Dev)":
                await changeRow(lngType, keyMap, key, "확인(QI)", true);
                break;
              case "확정":
                // PASS
                break;
              case "삭제":
                await changeRow(lngType, keyMap, key, "", true);
                break;
              case "관리대상외":
                await changeRow(lngType, keyMap, key, "", true);
                break;
            }
          }

          // B. 시트와 리소스 값이 동일함
          else {
            // PASS
          }
        });
      }
    }

    // [batch update]
    await rowBatchUpdate();
    console.log("==2. 소스코드 리소스 변경점 시트에 반영 완료==");

    // [upload new keys]
    if (addedRows.length > 0) {
      await sheet.addRows(addedRows);
    }
    console.log("==3. 신규 리소스 업로드 완료==");
  } catch (err) {
    console.log("!!!!!!!!!");
    console.log(err);
  }
}

// [시트에 일괄 업로드]
async function rowBatchUpdate() {
  const sheets = google.sheets("v4");
  var updateValues = [];
  var index = 2;

  changedRows.forEach((element) => {
    const resourceColumnName = lngs[0] == "KO_KR" ? "KO_KR" : "EN_US";
    const statusColumnName = lngs[0] == "KO_KR" ? "KR_Status" : "EN_Status";

    var resourceObj = { range: sheetName + "!" + resource_Column_Num + index, values: [[element[resourceColumnName]]] }; // REOSURCE
    var statusObj = { range: sheetName + "!" + status_Column_Num + index, values: [[element[statusColumnName]]] }; // STATUS

    updateValues.push(resourceObj);
    updateValues.push(statusObj);
    index += 1;
  });

  var request = {
    auth: jwtClient,
    spreadsheetId: spreadsheetDocId,
    resource: {
      valueInputOption: "RAW",
      data: [...updateValues],
    },
  };
  const response = await sheets.spreadsheets.values.batchUpdate(request); //.data;
  // TODO: Change code below to process the `response` object:
  // console.log(JSON.stringify(response, null, 2));
}

// [시트에서 일괄 삭제]
async function rowBatchDelete(targetIndexs) {
  const sheets = google.sheets("v4");
  var deleteValues = [];

  for (var i = targetIndexs.length - 1; i >= 0; i--) {
    var targetIndex = targetIndexs[i] * 1 + 1;
    var temp = {
      deleteDimension: {
        range: {
          sheetId: errorSheetId,
          dimension: "ROWS",
          startIndex: targetIndex - 1,
          endIndex: targetIndex,
        },
      },
    };
    deleteValues.push(temp);
  }
  if (deleteValues.length > 0) {
    var batchDeleteRequest = {
      requests: [...deleteValues],
    };

    sheets.spreadsheets.batchUpdate({
      auth: jwtClient,
      spreadsheetId: spreadsheetDocId,
      requestBody: batchDeleteRequest,
    });
    // console.log("delete complete");
  }
}

// [특정 Row의 resource 및 status를 변경하여 일괄 업로드 대상 전역변수 갱신]
async function changeRow(lng = "KO_KR", keyMap, targetKey, status = "", isChangeValue = false) {
  // 각 Row별로 업데이트 하려고 했는데, 시트가 업데이트 되기 전에 다음 업로드를 시행해버려서 결국 한가지 언어만 변경되는 문제 있음
  // => 시트에 변경 대상 리소스를 일괄 업데이트하도록 방안 조정 (전역변수 사용)

  var keyMapArr = Object.entries(keyMap);
  for (var i = 0; i < changedRows.length; i++) {
    const row = changedRows[i];
    const key = row[columnKeyToHeader.key];
    if (key == targetKey) {
      if (status != "") {
        if (lng == "KO_KR") {
          changedRows[i][`KR_Status`] = status;
        } else if (lng == "EN_US") {
          changedRows[i][`EN_Status`] = status;
        } else {
          changedRows[i][`KR_Status`] = status;
        }
      }

      if (isChangeValue) {
        var resource = keyMapArr.filter((x) => x[0] == key)[0][1];
        if (lng == "KO_KR") {
          changedRows[i][`KO_KR`] = resource[`KO_KR`];
        } else if ("EN_US") {
          changedRows[i][`EN_US`] = resource[`EN_US`];
        }
      }
    }
  }
}

// [특정 Row를 삭제하여 일괄 업로드할 수 있도록 전역변수 갱신]
async function deleteRow(sheet, removeKeysIndex) {
  for (var i = removeKeysIndex.length - 1; i >= 0; i--) {
    var targetIndex = removeKeysIndex[i] * 1 - 1;
    changedRows.splice(targetIndex, 1);
  }
}

// [Object 타입으로 사용하던 키/리소스 데이터를 json 타입으로 변환]
function toJson(keyMap) {
  const json = {};

  Object.entries(keyMap).forEach(([__, keysByPlural]) => {
    for (const [keyWithPostfix, translations] of Object.entries(keysByPlural)) {
      json[keyWithPostfix] = {
        ...translations,
      };
    }
  });

  return json;
}

// [keyMap이라는 변수에 리소스 파일내 json 데이터를 Object 타입으로 변환하여 세팅 (형태: [{key:value},...])]
function gatherKeyMap(keyMap, lng, json) {
  var targetData = { ...json };

  // 2번째 depth 키를 사용
  if (lng == "KO_KR") {
    targetData = { ...json.ko };
  } else if (lng == "EN_US") {
    targetData = { ...json.en };
  }

  for (const [keyWithPostfix, translated] of Object.entries(targetData)) {
    const key = getPureKey(keyWithPostfix);
    if (key.includes("err_")) {
      // ERROR 타입의 리소스만 추출
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
}

// [초기 실행 함수]
async function updateSheetFromJson(lngs) {
  const doc = await loadSpreadsheet("ERROR", true);

  // console.log("localesPath: ", localesPath);
  fs.readdir(localesPath, (error, jsFiles) => {
    if (error) {
      throw error;
    }

    const keyMap = {};
    lngs.forEach((lng) => {
      //   const localeJsonFilePath = `${localesPath}/${lng}/${ns}.json`; **
      var localeJsonFilePath = "";
      if (lng == "KO_KR") {
        localeJsonFilePath = "lang/lang.ko.json";
      } else if (lng == "EN_US") {
        localeJsonFilePath = "lang/lang.en.json";
      }

      //.json file read
      // eslint-disable-next-line no-sync
      if (localeJsonFilePath != "") {
        // console.log("localeJsonFilePath: ", localeJsonFilePath);
        const json = fs.readFileSync(localeJsonFilePath, "utf8");
        gatherKeyMap(keyMap, lng, JSON.parse(json));
      }
    });

    // 스프레드 시트에 업데이트
    updateTranslationsFromKeyMapToSheet(doc, toJson(keyMap));
  });
}

// [특정 Row의 resource 변경값 시트에 적용] - 덮어쓰기 문제로 인해 해당 함수 대신 일괄 업로드 사용중
async function changeResource(sheet, lng, targetKey, value) {
  var rows = await sheet.getRows();
  for (var i = 0; i < rows.length; i++) {
    const row = rows[i];
    const key = row[columnKeyToHeader.key];
    if (key == targetKey) {
      if (lng == "KO_KR") {
        rows[i][`KO_KR`] = value;
        await rows[i].save();
      } else if (lng == "EN_US") {
        rows[i][`EN_US`] = value;
        await rows[i].save();
      }
    }
  }
}

// [특정 Row의 status 변경값 시트에 적용] - 덮어쓰기 문제로 인해 해당 함수 대신 일괄 업로드 사용중
async function changeStatus(sheet, targetKey, statusValue) {
  var rows = await sheet.getRows();
  for (var i = 0; i < rows.length; i++) {
    const row = rows[i];
    const key = row[columnKeyToHeader.key];
    if (key == targetKey) {
      rows[i].Status = statusValue;
      await rows[i].save();
    }
  }
}

/* [메인] */
const params = process.argv.slice(2);
const lngs = [params[0]];
const resource_Column_Num = params[1];
const status_Column_Num = params[2];
const columnKeyToHeader = { key: "Key" };
if (lngs.includes("KO_KR")) {
  columnKeyToHeader.KO_KR = "KO_KR";
}
if (lngs.includes("EN_US")) {
  columnKeyToHeader.EN_US = "EN_US";
}

updateSheetFromJson(lngs);
