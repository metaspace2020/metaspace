/**
 * Per-pixel normalization of ion images. The engine stores one diagnostic per normalization type
 * (see DiagnosticType in metaspace/engine/sm/engine/annotation/diagnostics.py) holding an NPY image
 * of the per-pixel divisor plus its min/max in the diagnostic's `data` field.
 */

export type NormalizationType = 'TIC' | 'RMS' | 'MEDIAN'

interface NormalizationTypeInfo {
  /** Shown in the normalization dropdown */
  label: string
  /** Shown in the badge over the ion image and in the pixel-hover readout */
  shortLabel: string
  /** Prefix of the `min_`/`max_` fields in the diagnostic's data, and of CSV export filenames */
  field: string
}

export const NORMALIZATION_TYPES: Record<NormalizationType, NormalizationTypeInfo> = {
  TIC: { label: 'TIC', shortLabel: 'TIC', field: 'tic' },
  RMS: { label: 'RMS', shortLabel: 'RMS', field: 'rms' },
  MEDIAN: { label: 'Median', shortLabel: 'Median', field: 'median' },
}

export const NORMALIZATION_OPTIONS = (Object.keys(NORMALIZATION_TYPES) as NormalizationType[]).map((value) => ({
  value,
  label: NORMALIZATION_TYPES[value].label,
}))

export const isNormalizationType = (value: any): value is NormalizationType => value in NORMALIZATION_TYPES

/**
 * Parses the `norm` URL parameter. Links created before RMS/median existed used `norm=true` to mean
 * TIC, and vue-router may hand back the value as a boolean, so both forms are accepted.
 * Anything unrecognised turns normalization off rather than leaving the UI in a broken state.
 */
export const parseNormalization = (value: any): NormalizationType | false => {
  if (value === true || value === 'true') {
    return 'TIC'
  }
  return isNormalizationType(value) ? value : false
}

/** e.g. 'TIC normalized' - used for the badge over the image */
export const normalizationBadgeText = (type: any): string =>
  `${isNormalizationType(type) ? NORMALIZATION_TYPES[type].shortLabel : 'TIC'} normalized`

/** e.g. 'TIC-relative intensity' - used for the pixel-hover readout */
export const normalizationIntensityLabel = (type: any): string =>
  `${isNormalizationType(type) ? NORMALIZATION_TYPES[type].shortLabel : 'TIC'}-relative intensity`

/** e.g. '_tic_normalized' - appended to CSV export filenames */
export const normalizationFileSuffix = (type: any): string =>
  `_${isNormalizationType(type) ? NORMALIZATION_TYPES[type].field : 'tic'}_normalized`

/**
 * Renames the type-specific min/max fields of a diagnostic's data (e.g. `min_rms`/`max_rms`) to the
 * type-agnostic `minNorm`/`maxNorm` that processIonImage reads. `minTic`/`maxTic` are also set for
 * TIC, as the pages that only support TIC still read them.
 */
export const buildNormalizationMetadata = (data: any, type: NormalizationType) => {
  const { field } = NORMALIZATION_TYPES[type]
  const metadata = { ...(data || {}) }
  metadata.minNorm = metadata[`min_${field}`]
  metadata.maxNorm = metadata[`max_${field}`]
  if (type === 'TIC') {
    metadata.minTic = metadata.min_tic
    metadata.maxTic = metadata.max_tic
  }
  return metadata
}

/**
 * Finds the NPY image of the given normalization type among a dataset's diagnostics.
 * Returns null when the dataset predates that diagnostic, or when the engine failed to compute it -
 * in both cases the dataset needs reprocessing.
 */
export const findNormalizationImage = (diagnostics: any[], type: NormalizationType) => {
  const diagnostic = (diagnostics || []).find((d: any) => d?.type === type)
  const image = (diagnostic?.images || []).find((img: any) => img.key === type && img.format === 'NPY')
  return image ? { url: image.url, data: diagnostic.data } : null
}
