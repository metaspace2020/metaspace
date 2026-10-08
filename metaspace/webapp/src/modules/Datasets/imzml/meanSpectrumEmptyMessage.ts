/** Availability of one region (an ROI or the whole dataset) for a mean spectrum. */
export interface MeanSpectrumRegionAvailabilityInput {
  roiId: string | null
  peaks?: number | null
  available: boolean
  reason?: string | null
}

/** Dataset-level availability as returned by `meanSpectrumAvailability`. */
export interface MeanSpectrumAvailabilityInput {
  available: boolean
  reason?: string | null
  wholeDatasetAvailable: boolean
  regions?: MeanSpectrumRegionAvailabilityInput[] | null
}

export interface MeanSpectrumEmptyMessageInput {
  /** Message of the last `meanSpectrum` query error, if any. */
  errorMessage?: string | null
  availability?: MeanSpectrumAvailabilityInput | null
  /** Availability of the region currently resolved for display, if one could be resolved. */
  selectedRegion?: Pick<MeanSpectrumRegionAvailabilityInput, 'available' | 'reason'> | null
  /** Whether the dataset has any saved (non-legacy) ROI. */
  hasRois: boolean
}

export const MEAN_SPECTRUM_NO_ROIS_MESSAGE =
  'No saved regions for this dataset — define an ROI to see its mean spectrum'
export const MEAN_SPECTRUM_ALL_REGIONS_UNAVAILABLE_MESSAGE = 'All regions are too large for a mean spectrum'
export const MEAN_SPECTRUM_NO_PEAKS_MESSAGE = 'No peaks passed the minimum pixel support for this region'

/**
 * Picks the message shown in the mean spectrum chart's empty state.
 *
 * Precedence: unavailable selected region → query error → dataset-level
 * unavailability → nothing to select (no ROIs, whole dataset too large; or every ROI too
 * large, in which case the engine's reason for the first ROI is surfaced) → no peaks.
 */
export const meanSpectrumEmptyMessage = (input: MeanSpectrumEmptyMessageInput): string => {
  const { errorMessage, availability, selectedRegion, hasRois } = input

  if (selectedRegion && !selectedRegion.available) {
    return selectedRegion.reason || 'This region is unavailable'
  }
  if (errorMessage) {
    return errorMessage.replace(/^GraphQL error:\s*/, '')
  }
  if (availability && !availability.available) {
    return availability.reason || 'Mean spectrum is unavailable for this dataset'
  }
  if (!hasRois && !availability?.wholeDatasetAvailable) {
    return MEAN_SPECTRUM_NO_ROIS_MESSAGE
  }
  // No region could be resolved for display: the dataset has ROIs but every one of them
  // is over the engine's peak cap (and the whole dataset is too, or it would have been
  // picked as the fallback). Show the engine's reason rather than the generic no-peaks text.
  const regions = availability?.regions ?? []
  if (!selectedRegion && hasRois && regions.length > 0 && regions.every((region) => !region.available)) {
    return regions[0].reason || MEAN_SPECTRUM_ALL_REGIONS_UNAVAILABLE_MESSAGE
  }
  return MEAN_SPECTRUM_NO_PEAKS_MESSAGE
}
