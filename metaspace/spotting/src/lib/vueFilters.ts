/**
 * If `suffix` is non-null & non-empty, it is wrapped in parens and appended to `content`.
 * */
export const optionalSuffixInParens = (content: string, suffix: any) => {
  if (suffix != null && suffix !== '') {
    return `${content} (${String(suffix)})`
  } else {
    return content
  }
}

export const plural = (number: number | string, singularSuffix: string, pluralSuffix: string) => {
  return number === 1 || number === '1' ? `${number} ${singularSuffix}` : `${number} ${pluralSuffix}`
}
