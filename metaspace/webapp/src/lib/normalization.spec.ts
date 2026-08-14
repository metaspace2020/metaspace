import {
  buildNormalizationMetadata,
  findNormalizationImage,
  normalizationBadgeText,
  normalizationFileSuffix,
  parseNormalization,
} from './normalization'

describe('parseNormalization', () => {
  const legacyCases = [true, 'true'] as const
  it.each(legacyCases)('should map the legacy norm=%s to TIC', (input) => {
    expect(parseNormalization(input)).toBe('TIC')
  })

  const validCases = ['TIC', 'RMS', 'MEDIAN'] as const
  it.each(validCases)('should accept %s', (input) => {
    expect(parseNormalization(input)).toBe(input)
  })

  const invalidCases = ['banana', 'tic', '', null, undefined, false, 0]
  it.each(invalidCases)('should reject %s', (input) => {
    expect(parseNormalization(input)).toBe(false)
  })
})

describe('normalization labels', () => {
  it('should name the type in the badge', () => {
    expect(normalizationBadgeText('TIC')).toBe('TIC normalized')
    expect(normalizationBadgeText('RMS')).toBe('RMS normalized')
    expect(normalizationBadgeText('MEDIAN')).toBe('Median normalized')
  })

  it('should name the type in the CSV filename suffix', () => {
    expect(normalizationFileSuffix('TIC')).toBe('_tic_normalized')
    expect(normalizationFileSuffix('RMS')).toBe('_rms_normalized')
    expect(normalizationFileSuffix('MEDIAN')).toBe('_median_normalized')
  })
})

describe('buildNormalizationMetadata', () => {
  it('should expose the type-specific min/max as minNorm/maxNorm', () => {
    const metadata = buildNormalizationMetadata({ min_rms: 3, max_rms: 40 }, 'RMS')
    expect(metadata.minNorm).toBe(3)
    expect(metadata.maxNorm).toBe(40)
  })

  it('should also set minTic/maxTic for TIC, as TIC-only pages read them', () => {
    const metadata = buildNormalizationMetadata({ min_tic: 1, max_tic: 20 }, 'TIC')
    expect(metadata.maxNorm).toBe(20)
    expect(metadata.maxTic).toBe(20)
    expect(metadata.minTic).toBe(1)
  })
})

describe('findNormalizationImage', () => {
  const diagnostics = [
    { type: 'TIC', data: '{"max_tic": 20}', images: [{ key: 'TIC', format: 'NPY', url: 'tic.npy' }] },
    { type: 'RMS', data: '{"max_rms": 40}', images: [{ key: 'RMS', format: 'NPY', url: 'rms.npy' }] },
    // A diagnostic the engine failed to compute has no images
    { type: 'MEDIAN', data: null, images: [] },
  ]

  it('should find the image of the requested type', () => {
    expect(findNormalizationImage(diagnostics, 'RMS')).toEqual({ url: 'rms.npy', data: '{"max_rms": 40}' })
  })

  it('should return null when the diagnostic is missing', () => {
    expect(findNormalizationImage([diagnostics[0]], 'RMS')).toBeNull()
  })

  it('should return null when the diagnostic errored and has no images', () => {
    expect(findNormalizationImage(diagnostics, 'MEDIAN')).toBeNull()
  })
})
