const validElement = new RegExp(
  '/A[cglmrstu]|B[aeikr]?|C[adelorsu]?|D[by]|E[rsu]|F[er]?|G[ade]|H[efgo]?|I[nr]?|Kr?|L[airu]|M[dgno]|'
  + 'N[abdeip]?|Os?|P[abdmrt]?|R[behu]|S[bceimnr]?|T[abceilm]|U|V|W|Xe|Yb?|Z[nr]',
)

const validFormulaModifier = new RegExp(`([+-]((${validElement.source})[0-9]{0,3})+)+`)

export const normalizeFormulaModifier = (formula: string, defaultSign: '+' | '-') => {
  if (!formula) return null
  // It won't work for all situations, but for lazy users convert "h2o" to "H2O"
  if (formula === formula.toLowerCase()) {
    formula = formula.toUpperCase()
  }
  // Tidy & regularize formula as much as possible
  if (!formula.startsWith('-') && !formula.startsWith('+')) {
    formula = defaultSign + formula
  }
  formula = formula.replace(/\s/g, '')
  // If it's not valid after tidying, reject it
  const match = validFormulaModifier.exec(formula)
  return match != null && match[0] === formula ? formula : null
}
