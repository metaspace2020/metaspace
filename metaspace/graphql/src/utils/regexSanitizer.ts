export const containsSpecialChars = (query: string) => {
  // eslint-disable-next-line
    return /[<>(){}\[\]]/.test(query)
}

export const escapeUnenclosedSpecialChars = (query: string) => {
  let result = ''
  const stack = []

  for (let i = 0; i < query.length; i++) {
    const char = query[i]
    if (char === '<' || char === '(' || char === '[' || char === '{') {
      stack.push(char)
      result += char
    } else if (char === '>' || char === ')' || char === ']' || char === '}') {
      if (
        (char === '>' && stack.length && stack[stack.length - 1] === '<')
                || (char === ')' && stack.length && stack[stack.length - 1] === '(')
                || (char === ']' && stack.length && stack[stack.length - 1] === '[')
                || (char === '}' && stack.length && stack[stack.length - 1] === '{')
      ) {
        stack.pop()
        result += char
      } else {
        result += `\\${char}`
      }
    } else {
      result += char
    }
  }

  // Escape any unclosed opening characters left in the stack
  while (stack.length > 0) {
    const last = stack.pop()
    result = result.replace(new RegExp('\\' + (last as string), 'g'), `\\${last}`)
  }

  return result
}

export const cleanEmptyStrings = (values: string[] | undefined | null): string[] => {
  if (!values) return []

  const INVALID = new Set(['none', 'undefined', 'null', ''])

  return values
    .map(v => v.trim())
    .map(v => v.replace(/\s+/g, ''))
    .filter(v => !INVALID.has(v.toLowerCase()))
}
