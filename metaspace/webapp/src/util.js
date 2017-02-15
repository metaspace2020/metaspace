import fetch from 'isomorphic-fetch';
import fuConfig from './fineUploaderConfig.json';

function prettifySign(str) {
    return str.replace('-', ' – ').replace('+', ' + ');
}

function renderSumFormula(sumFormula, adduct, polarity) {
  let result = `[${(sumFormula + adduct).replace(/(\d+)/g, "<sub>$1</sub>")}]`;
  result = prettifySign(result);
  result += {'POSITIVE': '⁺', 'NEGATIVE': '¯'}[polarity];
  return result;
}

function checkStatus(response) {
  if (response.status >= 200 && response.status < 300) {
    return response
  } else {
    var error = new Error(response.statusText);
    error.response = response
    throw error;
  }
}

function getJWT() {
  return fetch("/getToken", {credentials: 'include'})
         .then(checkStatus).then(resp => resp.text())
}

function decodePayload(jwt) {
  return JSON.parse(new Buffer(jwt.split('.')[1], 'base64').toString());
}

function pathFromUUID(uuid) {
  if (fuConfig.storage == 's3')
    return 's3a://' + fuConfig.aws.s3_bucket + '/' + uuid;
  // TODO: support local storage
}

export {
  renderSumFormula,
  prettifySign,
  getJWT,
  decodePayload,
  pathFromUUID
};
