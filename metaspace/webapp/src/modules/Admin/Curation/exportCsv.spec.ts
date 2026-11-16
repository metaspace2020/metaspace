import { vi } from 'vitest'
import { curationTermsToCsv, downloadCsv } from './exportCsv'

const HEADER = [
  'typed_term,field,vocabulary,status,dataset_id,dataset_name,submitter,submitted',
  'suggested_label,suggested_id,suggested_score,canonical_label,ontology_id,note',
].join(',')

const TERM: any = {
  id: 't1',
  slot: 'ionization_source',
  text: 'AP-SMALDI5',
  status: 'PENDING',
  canonicalLabel: null,
  ontologyId: null,
  suggestedOntologyId: 'MS:1',
  suggestedLabel: 'AP-SMALDI',
  suggestedScore: 0.84,
  note: null,
  datasetId: '2026-10-14_12h00m00s',
  datasetName: 'patient_colon',
  submitter: { id: 'u1', name: 'Lucas Vieira' },
  submittedAt: '2026-10-14T12:00:00.000Z',
}

describe('curationTermsToCsv', () => {
  it('writes the exact header line', () => {
    expect(curationTermsToCsv([]).split('\r\n')[0]).toBe(HEADER)
  })

  it('writes a row with the slot label and vocabulary, score as is and nulls empty', () => {
    const [, row] = curationTermsToCsv([TERM]).split('\r\n')
    expect(row).toBe(
      'AP-SMALDI5,Ionisation source,MS,PENDING,2026-10-14_12h00m00s,patient_colon,Lucas Vieira,' +
        '2026-10-14T12:00:00.000Z,AP-SMALDI,MS:1,0.84,,,'
    )
  })

  it('quotes fields with commas and doubles quotes', () => {
    const [, row] = curationTermsToCsv([{ ...TERM, text: 'a, "b"', note: 'line\nbreak' }]).split('\r\n')
    expect(row.startsWith('"a, ""b""",')).toBe(true)
    expect(curationTermsToCsv([{ ...TERM, note: 'x,y' }])).toContain(',"x,y"\r\n')
    expect(curationTermsToCsv([{ ...TERM, note: 'line\nbreak' }])).toContain('"line\nbreak"')
  })

  it('prefixes formula-looking text with a single quote but leaves numbers alone', () => {
    const lines = curationTermsToCsv([
      {
        ...TERM,
        text: '=SUM(1)',
        note: '-1',
        canonicalLabel: '@x',
        datasetName: '=HYPERLINK("x")',
        submitter: { id: 'u', name: '+cmd,1' },
      },
    ]).split('\r\n')
    const row = lines[1]
    expect(row.startsWith("'=SUM(1),")).toBe(true)
    expect(row).toContain(',"\'+cmd,1",')
    expect(row).toContain(",'@x,")
    expect(row.endsWith(",'-1")).toBe(true)
    expect(row).toContain(',"\'=HYPERLINK(""x"")",')
    expect(row).toContain(',2026-10-14_12h00m00s,')
    expect(row).toContain(',0.84,')
    expect(curationTermsToCsv([{ ...TERM, text: '\tx' }])).toContain("'\tx")
  })

  it('writes empty fields for a missing submitter and suggestion', () => {
    const [, row] = curationTermsToCsv([
      {
        ...TERM,
        datasetName: null,
        submitter: null,
        submittedAt: null,
        suggestedLabel: null,
        suggestedOntologyId: null,
        suggestedScore: null,
      },
    ]).split('\r\n')
    expect(row).toBe('AP-SMALDI5,Ionisation source,MS,PENDING,2026-10-14_12h00m00s,,,,,,,,,')
  })
})

describe('downloadCsv', () => {
  it('clicks a temporary anchor with the file name and revokes the URL', () => {
    const create = vi.fn(() => 'blob:x')
    const revoke = vi.fn()
    ;(URL as any).createObjectURL = create
    ;(URL as any).revokeObjectURL = revoke
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('a.csv')
      expect(this.href).toContain('blob:x')
    })
    downloadCsv('a.csv', 'x')
    expect(create).toHaveBeenCalledTimes(1)
    expect((create.mock.calls[0] as any)[0].type).toBe('text/csv;charset=utf-8')
    expect(click).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledWith('blob:x')
    expect(document.querySelector('a[download]')).toBeNull()
    click.mockRestore()
  })
})
