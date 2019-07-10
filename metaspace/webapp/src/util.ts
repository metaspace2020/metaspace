import config from './config';
import sanitizeHtml from 'sanitize-html';
import {zipObject} from 'lodash-es';

const fuConfig = config.fineUploader;

type JWT = string;

const NORMAL_TO_SUPERSCRIPT = zipObject('0123456789+-', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻');
const NORMAL_TO_SUPERSCRIPT_RE = /[0-9+-]/g;

function superscript(s: string): string {
  return s.replace(NORMAL_TO_SUPERSCRIPT_RE, c => NORMAL_TO_SUPERSCRIPT[c]);
}

function renderMolFormula(ion: string): string {
  const match = /^(.*?)([+-]\d*)?$/.exec(ion);
  const formula = match && match[1] || ion;
  const charge = match && match[2] || undefined;
  const formattedCharge = charge ? superscript(charge) : '';
  const formattedFormula = formula.replace(/-/g, ' – ').replace(/\+/g, ' + ');

  return `[${formattedFormula}]${formattedCharge}`;
}

function renderMolFormulaHtml(ion: string): string {
  return renderMolFormula(ion).replace(/(\d+)/g, "<sub>$1</sub>");
}

function checkStatus(response: Response): Response {
  if (response.status >= 200 && response.status < 300) {
    return response
  } else {
    var error = new Error(response.statusText);
    throw error;
  }
}

async function getJWT(): Promise<JWT> {
  const url = '/api_auth/gettoken';
  const response = await fetch(url, {credentials: 'include'});
  checkStatus(response);
  return await response.text();
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

function mzFilterPrecision(value: number | string): string {
  // Using parseFloat to remove any extra decimal places that won't actually count toward the precision
  const splitVal = String(parseFloat(String(value))).split('.');
  if (splitVal.length == 1) {
    return '1';
  } else {
    const k = splitVal[1].length;
    return (1.0 * Math.pow(0.1, k)).toFixed(k);
  }
}

function scrollDistance(event: MouseWheelEvent) {
  let sY = 0;
  if ('detail'      in event) { sY = event.detail * 2; }
  if ('wheelDelta'  in event) { sY = -event.wheelDelta / 120; }
  if (('deltaY' in event) && !sY) { sY = (event.deltaY < 1) ? -1 : 1; }
  return sY;
}

function mdTypeSupportsOpticalImages(mdType: string): boolean {
  const mdTypesToSkipImages = ['LC-MS'];
  return !mdTypesToSkipImages.includes(mdType);
}

function getOS() {
  let userAgent = window.navigator.userAgent,
      platform = window.navigator.platform,
      macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'],
      windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'],
      iosPlatforms = ['iPhone', 'iPad', 'iPod'],
      os = null;

  if (macosPlatforms.indexOf(platform) !== -1) {
      os = 'Mac OS';
  } else if (iosPlatforms.indexOf(platform) !== -1) {
      os = 'iOS';
  } else if (windowsPlatforms.indexOf(platform) !== -1) {
      os = 'Windows';
  } else if (/Android/.test(userAgent)) {
      os = 'Android';
  } else if (!os && /Linux/.test(platform)) {
      os = 'Linux';
  }

  return os;
}

function sanitizeIt(descriptionText: string) {
  return sanitizeHtml(
    descriptionText,
    {
      allowedTags: [ 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
        'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
        'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'del'],
      allowedAttributes: {
        'a': ['href', 'rel']
      },
      transformTags: {
        'a': sanitizeHtml.simpleTransform('a', {rel: 'nofollow noopener noreferrer'})
      },
    });
}

export {
  renderMolFormula,
  renderMolFormulaHtml,
  getJWT,
  decodePayload,
  pathFromUUID,
  mzFilterPrecision,
  scrollDistance,
  mdTypeSupportsOpticalImages,
  getOS,
  sanitizeIt
};
