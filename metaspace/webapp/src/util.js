import fetch from 'isomorphic-fetch';

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

export { renderSumFormula, prettifySign, getJWT, decodePayload };
