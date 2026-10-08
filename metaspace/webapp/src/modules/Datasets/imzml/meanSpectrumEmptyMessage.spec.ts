import { meanSpectrumEmptyMessage, MeanSpectrumEmptyMessageInput } from './meanSpectrumEmptyMessage'

const region = (
  overrides: Partial<NonNullable<MeanSpectrumEmptyMessageInput['availability']>['regions'][number]> = {}
) => ({
  roiId: '1',
  peaks: 1000,
  available: true,
  reason: null,
  ...overrides,
})

const availability = (
  overrides: Partial<NonNullable<MeanSpectrumEmptyMessageInput['availability']>> = {}
): NonNullable<MeanSpectrumEmptyMessageInput['availability']> => ({
  available: true,
  reason: null,
  wholeDatasetAvailable: true,
  regions: [],
  ...overrides,
})

const base: MeanSpectrumEmptyMessageInput = {
  errorMessage: null,
  availability: availability(),
  selectedRegion: null,
  hasRois: true,
}

describe('meanSpectrumEmptyMessage', () => {
  it('returns the selected region reason when it is unavailable', () => {
    expect(
      meanSpectrumEmptyMessage({
        ...base,
        selectedRegion: { available: false, reason: 'Region has over 40 million peaks' },
        errorMessage: 'should not win',
      })
    ).toBe('Region has over 40 million peaks')
  })

  it('falls back to a generic string when the unavailable selected region has no reason', () => {
    expect(meanSpectrumEmptyMessage({ ...base, selectedRegion: { available: false } })).toBe(
      'This region is unavailable'
    )
  })

  it('shows the error message with the GraphQL error prefix stripped', () => {
    expect(meanSpectrumEmptyMessage({ ...base, errorMessage: 'GraphQL error:   Something broke' })).toBe(
      'Something broke'
    )
    expect(meanSpectrumEmptyMessage({ ...base, errorMessage: 'Plain failure' })).toBe('Plain failure')
  })

  it('returns the dataset-level reason when the whole availability is false', () => {
    expect(
      meanSpectrumEmptyMessage({
        ...base,
        availability: availability({ available: false, reason: 'Dataset is not processed' }),
      })
    ).toBe('Dataset is not processed')
  })

  it('asks for an ROI when there are none and the whole dataset is unavailable', () => {
    expect(
      meanSpectrumEmptyMessage({
        ...base,
        hasRois: false,
        availability: availability({ wholeDatasetAvailable: false }),
      })
    ).toBe('No saved regions for this dataset — define an ROI to see its mean spectrum')
  })

  it('surfaces the first region reason when every ROI is unavailable and nothing is selected', () => {
    const reason = 'Region has over 40 million peaks, above the 30 million peak limit for mean spectra'
    expect(
      meanSpectrumEmptyMessage({
        ...base,
        availability: availability({
          wholeDatasetAvailable: false,
          regions: [
            region({ roiId: '1', peaks: 40_000_000, available: false, reason }),
            region({ roiId: '2', peaks: 35_000_000, available: false, reason: 'Other reason' }),
          ],
        }),
      })
    ).toBe(reason)
  })

  it('uses a generic too-large message when unavailable regions carry no reason', () => {
    expect(
      meanSpectrumEmptyMessage({
        ...base,
        availability: availability({
          wholeDatasetAvailable: false,
          regions: [region({ available: false, reason: null })],
        }),
      })
    ).toBe('All regions are too large for a mean spectrum')
  })

  it('does not treat a mix of available and unavailable regions as all unavailable', () => {
    expect(
      meanSpectrumEmptyMessage({
        ...base,
        availability: availability({
          wholeDatasetAvailable: false,
          regions: [region({ roiId: '1', available: false, reason: 'Too big' }), region({ roiId: '2' })],
        }),
      })
    ).toBe('No peaks passed the minimum pixel support for this region')
  })

  it('falls back to the pixel support message by default', () => {
    expect(meanSpectrumEmptyMessage(base)).toBe('No peaks passed the minimum pixel support for this region')
    expect(meanSpectrumEmptyMessage({ ...base, availability: null })).toBe(
      'No peaks passed the minimum pixel support for this region'
    )
  })
})
