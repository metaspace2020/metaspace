import * as config from './clientConfig.json';

const fuConfig = config.fineUploader;

function prettifySign(str: string): string {
  return str.replace('-', ' – ').replace('+', ' + ');
}

function delay(timeMs: number) {
  return new Promise(resolve => setTimeout(resolve, timeMs));
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

export {
  renderMolFormula,
  prettifySign,
  delay,
  getJWT,
  decodePayload,
  pathFromUUID,
  mzFilterPrecision,
  csvExportHeader,
  scrollDistance,
  mdTypeSupportsOpticalImages,
  getOS
};
