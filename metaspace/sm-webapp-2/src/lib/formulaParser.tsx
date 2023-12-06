import { periodicTable } from './periodicTable'
import { reorderAdducts, superscript } from './util'

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

export const isFormulaValid = (formula: string) => {
  // check if formula follows the desired standard
  if (!formula.match('^(([A-Za-z]+[0-9]*)+([+-]{1,1}([A-Za-z]+[0-9]*)+)*)+$')) {
    return false
  }

  // check if typed strings are in period table
  // split string by number to cover cases like H2o being transformed to Ho
  const moleculesCandidates = formula.split(/\d+/).filter((a: string) => a)

  // check real molecules in moleculesCandidates matching with periodic table
  for (let j : number = 0; j < moleculesCandidates.length; j++) {
    const candidateMolecule = moleculesCandidates[j]
    const molecules = candidateMolecule.replace(/[^A-Za-z]/g, '').split(/(?=[A-Z])/)
    for (let i : number = 0; i < molecules.length; i++) {
      const molecule : string = molecules[i]
      if (!Object.keys(periodicTable).includes(molecule)) {
        return false
      }
    }
  }

  return true
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

export const calculateMzFromFormula = (molecularFormula: string, polarity?: string) => {
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

  if (polarity && polarity === 'POSITIVE') {
    mz += periodicTable.Ee[2][0]
  } else if (polarity && polarity === 'NEGATIVE') {
    mz -= periodicTable.Ee[2][0]
  }

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

export const parseFormulaAndCharge = (ion: string) => {
  const match = /^(.*?)([+-]\d*)?$/.exec(ion)
  const formula = match && match[1] || ion
  const charge = match && match[2] || undefined
  const fmtCharge = charge !== undefined ? charge : ''
  const fmtFormula = reorderAdducts(formula).replace(/([+-])/g, '$1')
  const parts = fmtFormula.split(/(\d+)/g)
  return `[${parts.join('')}]${fmtCharge}`
}
