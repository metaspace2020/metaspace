import fetch from 'isomorphic-fetch';
import config from './clientConfig.json';
import scales from 'plotly.js/src/components/colorscale/scales.js';
import extractScale from 'plotly.js/src/components/colorscale/extract_scale.js';
import {scaleLinear} from 'd3-scale';
import {rgb} from 'd3-color';

const fuConfig = config.fineUploader;

function prettifySign(str) {
    return str.replace('-', ' – ').replace('+', ' + ');
}

function renderMolFormula(sumFormula, adduct, polarity) {
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

function createColormap(name) {
  const {domain, range} = extractScale(scales[name], 0, 1);
  const sclFun = scaleLinear().domain(domain).range(range).clamp(true);

  let colors = [];
  for (let i = 0; i < 256; i++) {
    const {r, g, b} = rgb(sclFun(i / 255.0));
    colors.push([r, g, b].map(Math.round));
  }
  return colors;
}

function mzFilterPrecision(value) {
  const splitVal = (value + '').split('.');
  if (splitVal.length == 1) {
    return 0.5;
  } else {
    const k = splitVal[1].length;
    return (0.5 * Math.pow(0.1, k)).toFixed(k + 1);
  }
}

export {
  renderMolFormula,
  prettifySign,
  getJWT,
  decodePayload,
  pathFromUUID,
  createColormap,
  mzFilterPrecision
};
