import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { CurationTable } from './CurationTable'
import router from '../../../router'
import { CurationTerm } from '../../../api/metadataCuration'

const term = (overrides: Partial<CurationTerm>): CurationTerm => ({
  id: 't1',
  slot: 'sample_stabilisation',
  text: 'Organoid',
  normalizedText: 'organoid',
  status: 'PENDING',
  canonicalLabel: null,
  ontologyId: null,
  aliases: [],
  suggestedOntologyId: null,
  suggestedLabel: null,
  suggestedScore: null,
  note: null,
  datasetId: '2026-10-14_12h00m00s',
  datasetName: 'patient_colon',
  submitter: { id: 'u1', name: 'Lucas Vieira' },
  submittedAt: '2026-10-14T12:00:00.000Z',
  createdAt: '2026-10-14T12:00:00.000Z',
  decidedBy: null,
  decidedAt: null,
  applyState: 'IDLE',
  appliedCount: 0,
  ...overrides,
})

const TERMS = [
  term({}),
  term({
    id: 't2',
    slot: 'ionization_source',
    text: 'AP-SMALDI5',
    suggestedLabel: 'AP-MALDI',
    suggestedOntologyId: 'MS:1000397',
    suggestedScore: 0.84,
    datasetId: '2026-10-02_09h00m00s',
    datasetName: null,
    submitter: null,
    submittedAt: '2026-10-02T12:00:00.000Z',
  }),
]

describe('CurationTable', () => {
  const build = async (props: Record<string, unknown> = {}) => {
    const wrapper = mount(CurationTable, {
      props: { terms: TERMS, selected: [], sort: { by: 'FIRST_SUBMITTED', desc: true }, ...props },
      // the real RouterLink (setupTests stubs it): a link with a missing route param must fail here
      global: { plugins: [router], stubs: { RouterLink: false } },
    })
    await flushPromises()
    await nextTick()
    return wrapper
  }
  const rows = (wrapper: any) => wrapper.findAll('tbody tr')
  const headers = (wrapper: any) => wrapper.findAll('thead th').map((th: any) => th.text().replace(/[↓↑]/g, '').trim())

  it('renders a row per dataset with the spec copy', async () => {
    const wrapper = await build()
    expect(rows(wrapper)).toHaveLength(2)
    const first = rows(wrapper)[0].text()
    expect(first).toContain('Organoid')
    expect(first).toContain('Sample stabilisation · curated list')
    expect(first).toContain('patient_colon')
    expect(first).toContain('Lucas Vieira')
    expect(first).toContain('14 Oct 2026')
    expect(first).toContain('— none')
  })

  it('links the dataset cell to the dataset overview, falling back to the id', async () => {
    const wrapper = await build()
    const links = wrapper.findAll('tbody a.curation-dataset')
    expect(links.map((a: any) => a.text())).toEqual(['patient_colon', '2026-10-02_09h00m00s'])
    expect(links.map((a: any) => a.attributes('href'))).toEqual([
      '/dataset/2026-10-14_12h00m00s',
      '/dataset/2026-10-02_09h00m00s',
    ])
  })

  it('renders a row without a dataset id as plain text', async () => {
    const wrapper = await build({ terms: [term({ datasetId: '', datasetName: 'orphan' })] })
    expect(wrapper.findAll('tbody a.curation-dataset')).toHaveLength(0)
    expect(wrapper.find('tbody span.curation-dataset').text()).toBe('orphan')
  })

  it('renders the suggestion chip and an empty submitter', async () => {
    const wrapper = await build()
    const second = rows(wrapper)[1].text()
    expect(second).toContain('Ionisation source · MS')
    expect(wrapper.find('tbody tr:nth-child(2) .curation-chip').text()).toBe('AP-MALDI MS:1000397 84%')
    expect(second).toContain('2 Oct 2026')
    expect(second).not.toContain('Lucas Vieira')
  })

  it('heads the columns per dataset, without a count column', async () => {
    const wrapper = await build()
    expect(headers(wrapper)).toEqual([
      '',
      'Typed term',
      'Field · vocabulary',
      'Dataset',
      'Submitter',
      'Submitted',
      'Suggested match',
      '',
    ])
  })

  it('emits select with the checked row id', async () => {
    const wrapper = await build({ selected: ['t2'] })
    await rows(wrapper)[0].find('input[type="checkbox"]').setValue(true)
    expect(wrapper.emitted('select')).toEqual([[['t2', 't1']]])
  })

  it('emits select with every id from the header checkbox', async () => {
    const wrapper = await build()
    await wrapper.find('thead input[type="checkbox"]').setValue(true)
    expect(wrapper.emitted('select')).toEqual([[['t1', 't2']]])
  })

  it('emits review from the Review link', async () => {
    const wrapper = await build()
    const link = rows(wrapper)[1].find('.curation-review')
    expect(link.text()).toBe('Review ›')
    await link.trigger('click')
    expect(wrapper.emitted('review')).toEqual([['t2']])
  })

  it('emits sort from the sortable headers', async () => {
    const wrapper = await build()
    const sortable = wrapper.findAll('thead .curation-sort')
    expect(sortable.map((s: any) => s.text().replace(/[↓↑]/g, '').trim())).toEqual(['Typed term', 'Submitted'])
    await sortable[0].trigger('click')
    await sortable[1].trigger('click')
    expect(wrapper.emitted('sort')).toEqual([['TEXT'], ['FIRST_SUBMITTED']])
  })
})
