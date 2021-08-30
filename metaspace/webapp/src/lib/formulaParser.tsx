import { periodicTable } from './periodicTable'

export const parseFormula = (formula: string) => {
  const regexp = /(?<element>[A-Z][a-z]{0,2})(?<n>[0-9]*)/g
  const elements : Record<string, number> = {}
  Array.from(formula.matchAll(regexp), ({ groups = {} }) => {
    const { element, n } = groups
    if (element && element in periodicTable) {
      elements[element] = (elements[element] ?? 0) + parseInt(n !== '' ? n : '1', 10)
    } else {
      throw new Error(`Invalid element ${element}`)
    }
  })

  return elements
}

export const formatFormula = (elements: any) => {
  let formula = ''
  Object.keys(elements).sort().forEach((elementKey: string) => {
    const element = elements[elementKey]
    if (element > 0) {
      formula += elementKey + element
    }
  })
  return formula
}

export const calculateMzFromFormula = (molecularFormula: string) => {
  const ionFormula = generateIonFormula(molecularFormula)
  const ionElements = parseFormula(ionFormula)
  let mz = 0

  Object.keys(ionElements).forEach((elementKey: string) => {
    const nOfElements = ionElements[elementKey]
    if (periodicTable[elementKey]) {
      const mass = periodicTable[elementKey][2][0]
      mz += nOfElements * mass
    }
  })

  return mz
}

export const generateIonFormula = (molecularFormula: string) => {
  const cleanFormula = molecularFormula.trim().replace(/\s/g, '')
  const regexpFormulas = /(?<formula>\w+)(?<adducts>([+-]\w+)*)/ig
  const match = regexpFormulas.exec(cleanFormula)
  const formula = match && match.groups ? match.groups.formula : ''
  const adducts : string[] = []

  if (match && match.groups && match.groups.adducts) {
    const regexpAdduct = /([+-]\w+)/ig
    Array.from(match.groups.adducts.matchAll(regexpAdduct),
      (res, idx) => {
        adducts.push(res[0])
      })
  }

  const ionElements = parseFormula(formula)

  adducts.forEach((adduct: string) => {
    const adductElements = parseFormula(adduct)
    Object.keys(adductElements).forEach((key: string) => {
      if (adduct.indexOf('+') !== -1) {
        if (Object.keys(ionElements).includes(key)) {
          ionElements[key] += adductElements[key]
        } else {
          ionElements[key] = adductElements[key]
        }
      } else if (adduct.indexOf('-') !== -1) {
        if (Object.keys(ionElements).includes(key)) {
          ionElements[key] -= adductElements[key]
        }
      }
    })
  })

  return formatFormula(ionElements)
}
