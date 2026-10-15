const PLACEHOLDERS = new Set(['', 'none', 'n/a', 'na', '-', '--', 'not applicable', 'null', 'unknown', 'unspecified'])

export function isPlaceholder(text: string | null | undefined): boolean {
  return PLACEHOLDERS.has((text || '').trim().toLowerCase())
}

/** lowercase, collapse whitespace, drop a trailing "(…)" such as "Mus musculus (mouse)". */
export function normaliseText(text: string | null | undefined): string {
  return (text || '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

type AliasTable = Record<string, string>

const lower = (table: AliasTable): AliasTable =>
  Object.fromEntries(Object.entries(table).map(([k, v]) => [k.toLowerCase(), v]))

/** Replace a whole-value alias (case-insensitive); unknown input is returned unchanged. */
export function applyAliases(text: string, table: AliasTable): string {
  const hit = lower(table)[normaliseText(text)]
  return hit || text
}

/** Canonical label for a lookup table hit (case-insensitive), or null. */
export function lookupTable(text: string, table: AliasTable): string | null {
  return lower(table)[normaliseText(text)] || null
}

// Keys are what submitters typed in ims.json; values are CHEBI primary labels so the term search
// finds an exact match.
export const MATRIX_ALIASES: AliasTable = {
  DHB: '2,5-dihydroxybenzoic acid',
  '2,5-DHB': '2,5-dihydroxybenzoic acid',
  '2,5-dihydroxybenzoic acid': '2,5-dihydroxybenzoic acid',
  CHCA: 'alpha-cyano-4-hydroxycinnamic acid',
  HCCA: 'alpha-cyano-4-hydroxycinnamic acid',
  'α-CHCA': 'alpha-cyano-4-hydroxycinnamic acid',
  '9-AA': '9-aminoacridine',
  '9AA': '9-aminoacridine',
  DAN: '1,5-diaminonaphthalene',
  '1,5-DAN': '1,5-diaminonaphthalene',
  SA: 'sinapinic acid',
  DHAP: "2',6'-dihydroxyacetophenone",
  NEDC: 'N-(1-naphthyl)ethylenediamine dihydrochloride',
  norharmane: 'norharmane',
  norharman: 'norharmane',
  DMAN: '1,8-bis(dimethylamino)naphthalene',
  THAP: '2,4,6-trihydroxyacetophenone',
}

export const SOLVENT_ALIASES: AliasTable = {
  ACN: 'acetonitrile',
  MeCN: 'acetonitrile',
  acetonitrile: 'acetonitrile',
  MeOH: 'methanol',
  methanol: 'methanol',
  EtOH: 'ethanol',
  ethanol: 'ethanol',
  IPA: 'isopropanol',
  isopropanol: 'isopropanol',
  TFA: 'trifluoroacetic acid',
  FA: 'formic acid',
  water: 'water',
  H2O: 'water',
  DMSO: 'dimethyl sulfoxide',
}

export const SOURCE_ALIASES: AliasTable = {
  MALDI: 'matrix-assisted laser desorption ionization',
  'AP-MALDI': 'atmospheric pressure matrix-assisted laser desorption ionization',
  'AP MALDI': 'atmospheric pressure matrix-assisted laser desorption ionization',
  DESI: 'desorption electrospray ionization',
  SIMS: 'secondary ion MS',
  ESI: 'electrospray ionization',
  nanoDESI: 'nanospray desorption electrospray ionization',
  LAESI: 'laser ablation electrospray ionization',
  'LA-ICP': 'laser ablation inductively coupled plasma',
}

// Unbound slots (no ontology binding on the server): a hit stores free_text_accepted with this label.
export const STABILISATION_TABLE: AliasTable = {
  'fresh frozen': 'fresh frozen',
  'flash frozen': 'fresh frozen',
  'snap frozen': 'fresh frozen',
  frozen: 'fresh frozen',
  FFPE: 'formalin-fixed paraffin-embedded',
  'formalin fixed': 'formalin-fixed',
  'formalin-fixed': 'formalin-fixed',
  'paraformaldehyde fixed': 'paraformaldehyde-fixed',
  'pfa fixed': 'paraformaldehyde-fixed',
  fresh: 'fresh',
  'freeze dried': 'freeze-dried',
  lyophilised: 'freeze-dried',
  lyophilized: 'freeze-dried',
}

export const TISSUE_MODIFICATION_TABLE: AliasTable = {
  none: 'none',
  'no modification': 'none',
  untreated: 'none',
  'trypsin digestion': 'enzymatic digestion',
  'enzymatic digestion': 'enzymatic digestion',
  'on-tissue digestion': 'enzymatic digestion',
  derivatization: 'chemical derivatization',
  derivatisation: 'chemical derivatization',
  'chemical derivatization': 'chemical derivatization',
  washing: 'washing',
  washed: 'washing',
  delipidation: 'delipidation',
  'h&e staining': 'H&E staining',
  'h&e': 'H&E staining',
}

// Device-name substring -> application method. Matching is case-insensitive substring so
// "HTX TM Sprayer" and "TM-Sprayer" both hit.
export const APPLICATION_DEVICES: { match: RegExp; method: string; isDevice: boolean }[] = [
  { match: /tm[- ]?sprayer|htx/i, method: 'spraying', isDevice: true },
  { match: /suncollect/i, method: 'spraying', isDevice: true },
  { match: /imatrix/i, method: 'spraying', isDevice: true },
  { match: /imageprep/i, method: 'spraying (vibrational)', isDevice: true },
  { match: /airbrush|air brush/i, method: 'spraying', isDevice: true },
  { match: /electrospray/i, method: 'electrospray deposition', isDevice: false },
  { match: /spray/i, method: 'spraying', isDevice: false },
  { match: /sublimat/i, method: 'sublimation', isDevice: false },
  { match: /sieve|dry coat/i, method: 'dry coating', isDevice: false },
]

export function matrixApplication(raw: string): { method: string | null; device: string | null } {
  const text = raw.trim()
  for (const { match, method, isDevice } of APPLICATION_DEVICES) {
    if (match.test(text)) {
      return { method, device: isDevice ? text : null }
    }
  }
  return { method: null, device: null }
}

/**
 * "70% ACN" -> { compound: 'acetonitrile', remainder: '70% ACN' }. The first token that resolves
 * through SOLVENT_ALIASES wins; the raw string is kept as remainder when it carries anything beyond
 * the bare compound (concentration, additives).
 */
export function parseSolvent(raw: string): { compound: string | null; remainder: string | null } {
  const text = raw.trim()
  const tokens = text.split(/[\s,/:;+]+/).filter((t) => t && !/^[\d.]+%?$/.test(t))
  const table = lower(SOLVENT_ALIASES)
  const compound = tokens.map((t) => table[t.toLowerCase()]).find((c) => c) || null
  if (!compound) {
    return { compound: null, remainder: text || null }
  }
  const bare = tokens.length === 1 && text === tokens[0]
  return { compound, remainder: bare ? null : text }
}
