import { orderBy, zipObject } from 'lodash-es'

type JWT = string;

const NORMAL_TO_SUPERSCRIPT = zipObject('0123456789+-', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻')
const NORMAL_TO_SUPERSCRIPT_RE = /[0-9+-]/g

export function superscript(s: string): string {
  return s.replace(NORMAL_TO_SUPERSCRIPT_RE, c => NORMAL_TO_SUPERSCRIPT[c])
}

export function reorderAdducts(formula: string): string {
  // WORKAROUND: Scientists prefer if the ionizing adduct is shown before any neutral losses, chemical
  // modifications, etc. but the `annotation.ion` field puts those things between the base formula and adduct.
  // Split out the components of the formula and shift any adducts to the front
  const KNOWN_IONIZING_ADDUCTS = ['+H', '+K', '+Na', '+NH4', '-H', '+Cl']
  const [baseFormula, ...components] = formula.split(/(?=[+-])/g)
  const reordered = [
    baseFormula,
    ...orderBy(components, component => KNOWN_IONIZING_ADDUCTS.includes(component) ? 0 : 1),
  ]

  return reordered.join('')
}

export function renderMolFormula(ion: string): string {
  const match = /^(.*?)([+-]\d*)?$/.exec(ion)
  const formula = match && match[1] || ion
  const charge = match && match[2] || undefined
  const formattedCharge = charge ? superscript(charge) : ''
  const formattedFormula = reorderAdducts(formula).replace(/([+-])/g, ' $1 ')

  return `[${formattedFormula}]${formattedCharge}`
}

export function renderMolFormulaHtml(ion: string): string {
  // Deprecated - use src/components/MolecularFormula.tsx instead when possible
  return renderMolFormula(ion).replace(/(\d+)/g, '<sub>$1</sub>')
}

export function renderMassShift(referenceMz: number, subjectMz: number): string {
  const deltaMz = subjectMz - referenceMz
  return `[M${deltaMz >= 0 ? '+' : ''}${deltaMz.toFixed(4)}]`
}

export function formatNth(n: number): string {
  return [null, '1st', '2nd', '3rd'][n] || `${n}th`
}

export function formatHumanReadableList(items: string[]): string {
  if (items.length < 1) {
    return ''
  } else if (items.length === 1) {
    return items[0]
  } else if (items.length === 2) {
    return items.join(' and ')
  } else {
    return items.slice(0, -1).join(', ') + ', and' + items[items.length - 1]
  }
}

export function checkStatus(response: Response): Response {
  if (response.status >= 200 && response.status < 300) {
    return response
  } else {
    var error = new Error(response.statusText)
    throw error
  }
}

export async function getJWT(): Promise<JWT> {
  const url = '/api_auth/gettoken'
  const response = await fetch(url, { credentials: 'include' })
  checkStatus(response)
  return response.text()
}

export function decodePayload(jwt: JWT) {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString())
}

export function mzFilterPrecision(value: number | string): string {
  // Using parseFloat to remove any extra decimal places that won't actually count toward the precision
  const splitVal = String(value).split('.')
  if (splitVal.length === 1) {
    return '1'
  } else {
    const k = splitVal[1].length
    return (1.0 * Math.pow(0.1, k)).toFixed(k)
  }
}

export interface WheelEventCompat extends WheelEvent { wheelDelta?: number }
export function scrollDistance(event: WheelEventCompat) {
  let sY = 0
  if ('detail' in event) { sY = event.detail * 2 }
  if ('wheelDelta' in event) { sY = -event.wheelDelta! / 120 }
  if (('deltaY' in event) && !sY) { sY = (event.deltaY < 1) ? -1 : 1 }
  return sY
}

export function mdTypeSupportsOpticalImages(mdType: string): boolean {
  const mdTypesToSkipImages = ['LC-MS']
  return !mdTypesToSkipImages.includes(mdType)
}

export function getOS() {
  const userAgent = window.navigator.userAgent
  const platform = window.navigator.platform
  const macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K']
  const windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE']
  const iosPlatforms = ['iPhone', 'iPad', 'iPod']
  let os = null

  if (macosPlatforms.indexOf(platform) !== -1) {
    os = 'Mac OS'
  } else if (iosPlatforms.indexOf(platform) !== -1) {
    os = 'iOS'
  } else if (windowsPlatforms.indexOf(platform) !== -1) {
    os = 'Windows'
  } else if (/Android/.test(userAgent)) {
    os = 'Android'
  } else if (!os && /Linux/.test(platform)) {
    os = 'Linux'
  }

  return os
}

export const parseS3Url = (parsedUrl: URL) => {
  if (parsedUrl.host.includes('.')) {
    // When using S3, the bucket appears in the subdomain e.g. https://sm-engine-upload.s3.eu-west-1.amazonaws.com/
    const bucket = parsedUrl.host.split('.')[0]
    const key = parsedUrl.pathname.slice(1)
    return { bucket, key }
  } else {
    // When using Minio, the bucket is the first path item, e.g. http://localhost:9000/sm-engine-dev/
    const bucket = parsedUrl.pathname.split('/')[1]
    const key = parsedUrl.pathname.split('/').slice(2).join('/')
    return { bucket, key }
  }
}

export const convertUploadUrlToS3Path = (url: string) => {
  const { bucket, key } = parseS3Url(new URL(url))
  return `s3://${bucket}/${key}`
}
