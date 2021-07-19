const validElement = new RegExp(
  // NOTE: this regex should only contain elements that are accepted by METASPACE.
  // This means only elements that are supported in BOTH of these libraries:
  // pyMSpec: https://github.com/alexandrovteam/pyMSpec/blob/master/pyMSpec/pyisocalc/periodic_table.py
  // cpyMSpec (which uses ims-cpp): https://github.com/alexandrovteam/ims-cpp/blob/d8ba14b36c1a0303a6c9799c3c25ddb8eda3dea9/ms/periodic_table.cpp
  'A[cglrstu]|B[aeir]?|C[adelorsu]?|Dy|E[ru]|F[er]?|G[ade]|H[efgo]?|I[nr]?|Kr?|L[aiu]|M[gno]|'
  + 'N[abdei]?|Os?|P[abdmort]?|R[behu]|S[bceimnr]?|T[abceilm]|U|V|W|Xe|Yb?|Z[nr]',
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
