import { periodicTable } from './periodicTable'

export const parseFormula = (formula: string) => {
  const regexp = /(?<element>[A-Z][a-z]{0,2})(?<n>[0-9]*)/ig
  const elements : any = {}
  Array.from(formula.matchAll(regexp), (res, idx) => {
    if (res.groups && res.groups.element && res.groups.element.length > 1) {
      if (periodicTable[res.groups.element] === undefined) {
        const auxElement = res.groups.element.substring(1, 2)
        const auxElementCount = parseFormula(auxElement
          + (res.groups && res.groups.n ? parseInt(res.groups.n, 10) : 1))

        if (Object.keys(elements).includes(auxElement)) {
          elements[auxElement] += auxElementCount[auxElement]
        } else {
          elements[auxElement] = auxElementCount[auxElement]
        }

        res.groups.element = res.groups.element.substring(0, 1)
        res.groups.n = '1'
      }
    }

    if (res.groups && res.groups.element in Object.keys(elements)) {
      elements[res.groups.element] = elements[res.groups.element]
        + (res.groups && res.groups.n ? parseInt(res.groups.n, 10) : 1)
    } else if (res.groups && !(res.groups.element in Object.keys(elements))) {
      elements[res.groups.element] = (res.groups && res.groups.n ? parseInt(res.groups.n, 10) : 1)
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
  const cleanFormula = molecularFormula.toUpperCase().trim().replace(/\s/g, '')
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
    const elem = adduct.replace(/[^a-zA-Z]/g, '')
    if (adduct.indexOf('+') !== -1) {
      if (Object.keys(ionElements).includes(elem)) {
        ionElements[elem] += 1
      } else {
        ionElements[elem] = 1
      }
    } else if (adduct.indexOf('-') !== -1) {
      if (Object.keys(ionElements).includes(elem)) {
        ionElements[elem] -= 1
      }
    }
  })

  return formatFormula(ionElements)
}
