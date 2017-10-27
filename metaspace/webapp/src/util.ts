import * as config from './clientConfig.json';
import * as scales from 'plotly.js/src/components/colorscale/scales.js';
import * as extractScale from 'plotly.js/src/components/colorscale/extract_scale.js';
import * as d3 from 'd3';

const fuConfig = config.fineUploader;

function prettifySign(str: string): string {
  return str.replace('-', ' – ').replace('+', ' + ');
}

interface StringDictionary {
  [x: string]: string
}

type JWT = string;

function renderMolFormula(sumFormula: string, adduct: string, polarity: string): string {
  let result = `[${(sumFormula + adduct).replace(/(\d+)/g, "<sub>$1</sub>")}]`;
  const shorten: StringDictionary = {'POSITIVE': '⁺', 'NEGATIVE': '¯'};
  result = prettifySign(result) + shorten[polarity];
  return result;
}

function checkStatus(response: Response): Response {
  if (response.status >= 200 && response.status < 300) {
    return response
  } else {
    var error = new Error(response.statusText);
    throw error;
  }
}

function getJWT(): Promise<JWT> {
  return fetch("/getToken", {credentials: 'include'})
         .then(checkStatus).then(resp => resp.text())
}

function decodePayload(jwt: JWT) {
  return JSON.parse(new Buffer(jwt.split('.')[1], 'base64').toString());
}

function pathFromUUID(uuid: string): string {
  if (fuConfig.storage == 's3')
    return 's3a://' + fuConfig.aws.s3_bucket + '/' + uuid;
  else
    return fuConfig.storage + '/' + uuid + '/';
}

interface ColorScale {
  domain: number[]
  range: d3.RGBColor[]
}

function getColorScale(name: string): ColorScale {
  if (name[0] != '-')
    return extractScale(scales[name], 0, 1); // normal
  else
    return extractScale(scales[name.slice(1)], 1, 0); // inverted
}

function createColormap(name: string): number[][] {
  const {domain, range} = getColorScale(name);
  const sclFun = d3.scaleLinear<d3.RGBColor>().domain(domain).range(range).clamp(true);

  let colors = [];
  for (let i = 0; i < 256; i++) {
    const color = d3.rgb(sclFun(i / 255.0));
    colors.push([color.r, color.g, color.b].map(Math.round));
  }
  return colors;
}

function mzFilterPrecision(value: number): string {
  const splitVal = (value + '').split('.');
  if (splitVal.length == 1) {
    return '1';
  } else {
    const k = splitVal[1].length;
    return (1.0 * Math.pow(0.1, k)).toFixed(k);
  }
}

function csvExportHeader(): string {
  return '# Generated at ' + new Date().toString() + '\n# URL: ' + window.location.href + '\n';
}

function scrollDistance(event: MouseWheelEvent) {
  let sY = 0;
  if ('detail'      in event) { sY = event.detail * 2; }
  if ('wheelDelta'  in event) { sY = -event.wheelDelta / 120; }
  if (('deltaY' in event) && !sY) { sY = (event.deltaY < 1) ? -1 : 1; }
  return sY;
}

export {
  renderMolFormula,
  prettifySign,
  getJWT,
  decodePayload,
  pathFromUUID,
  getColorScale,
  createColormap,
  mzFilterPrecision,
  csvExportHeader,
  scrollDistance
};
