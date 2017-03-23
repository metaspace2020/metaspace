import fetch from 'isomorphic-fetch';
import config from './clientConfig.json';
import Colorscale from 'plotly.js/src/components/colorscale';
import {scale} from 'd3';

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
  const {domain, range} = Colorscale.extractScale(Colorscale.getScale(name), 0, 1);
  const sclFun = scale.linear().domain(domain).range(range).clamp(true);

  let colors = [];
  for (let i = 0; i < 256; i++) {
    let c = sclFun(i / 255.0),
        hex = parseInt(c.slice(1), 16),
        r = hex >> 16,
        g = hex >> 8 & 0xFF,
        b = hex & 0xFF;
    colors.push([r, g, b].map(Math.round));
  }
  return colors;
}

export {
  renderMolFormula,
  prettifySign,
  getJWT,
  decodePayload,
  pathFromUUID,
  createColormap
};
