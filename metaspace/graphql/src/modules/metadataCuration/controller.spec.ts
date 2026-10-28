import * as moment from 'moment'
import {
  adminContext,
  adminUser,
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testEntityManager,
  userContext,
} from '../../tests/graphqlTestEnvironment'
import { createTestDataset, createTestUser } from '../../tests/testDataCreation'
import { MetadataCurationTerm } from './model'
import { normalizeCurationText } from './normalize'
import { applyCurationTerm } from './apply'

jest.mock('./apply')
const mockApply = applyCurationTerm as jest.Mock
const appliedIds = (): string[] => mockApply.mock.calls.map((call: any[]) => call[1])

const TERM_FIELDS = `id slot text normalizedText status canonicalLabel ontologyId aliases note
  datasetId datasetName submittedAt submitter { id name } createdAt decidedAt applyState appliedCount
  decidedBy { id }`

const termsQuery = `query ($status: CurationTermStatus, $slot: String, $submitterId: ID, $query: String,
  $orderBy: CurationTermOrderBy, $offset: Int, $limit: Int) {
  curationTerms(status: $status, slot: $slot, submitterId: $submitterId, query: $query, orderBy: $orderBy,
    offset: $offset, limit: $limit) {
    terms { ${TERM_FIELDS} } total statusCounts { pending approved rejected }
  }
}`
const termQuery = `query ($id: ID!) { curationTerm(id: $id) { ${TERM_FIELDS} } }`
const statusQuery = 'query ($datasetId: ID!) { datasetCurationStatus(datasetId: $datasetId) { slot text status note } }'
const valuesQuery = `query ($slot: String!, $query: String!, $limit: Int) {
  approvedCurationValues(slot: $slot, query: $query, limit: $limit)
}`
const approveMutation = `mutation ($input: ApproveCurationTermInput!) {
  approveCurationTerms(input: $input) { terms { ${TERM_FIELDS} } skipped }
}`
const mapMutation = `mutation ($input: MapCurationTermInput!) {
  mapCurationTerms(input: $input) { terms { ${TERM_FIELDS} } skipped }
}`
const rejectMutation = `mutation ($input: RejectCurationTermInput!) {
  rejectCurationTerms(input: $input) { terms { ${TERM_FIELDS} } skipped }
}`
const retryMutation = `mutation ($id: ID!) { retryCurationApply(id: $id) { ${TERM_FIELDS} } }`

const asAdmin = (query: string, variables: any) => doQuery(query, variables, { context: adminContext })

/** A row on its own new dataset (owned by the test user) unless `datasetId` is given. */
const createTerm = async(fields: Partial<MetadataCurationTerm> & { text: string }) =>
  await testEntityManager.save(MetadataCurationTerm, {
    slot: 'disease',
    normalizedText: normalizeCurationText(fields.text),
    datasetId: fields.datasetId ?? (await createTestDataset()).id,
    ...fields,
  }) as MetadataCurationTerm

const reload = (id: string) => testEntityManager.findOne(MetadataCurationTerm, id)

const insertOntologyTerm = async(curie: string, subtree: string, label: string) => {
  await testEntityManager.query(
    'INSERT INTO public.ontology_term (curie, subtree, label, synonyms, ontology, obsolete) VALUES ($1, $2, $3, $4, $5, false)',
    [curie, subtree, label, [], 'mondo']
  )
}

// the engine dataset column is transformed from Moment, though the entity types it as Date
const utc = (iso: string) => moment.utc(iso) as unknown as Date

describe('metadataCuration controller', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    mockApply.mockReset()
    mockApply.mockResolvedValue(undefined)
  })
  afterEach(onAfterEach)

  it('non-admin is refused on every query and mutation', async() => {
    const id = '00000000-0000-0000-0000-000000000000'
    const operations: [string, any][] = [
      [termsQuery, {}],
      [termQuery, { id }],
      [approveMutation, { input: { ids: [id] } }],
      [mapMutation, { input: { ids: [id], ontologyId: 'MONDO:1' } }],
      [rejectMutation, { input: { ids: [id], note: 'n' } }],
      [retryMutation, { id }],
    ]
    for (const [query, variables] of operations) {
      await expect(doQuery(query, variables, { context: userContext })).rejects.toThrow(/Not authorized/)
    }
    expect(mockApply).not.toHaveBeenCalled()
  })

  describe('datasetCurationStatus', () => {
    it("returns the dataset's rows to its owner, ordered by slot", async() => {
      const ds = await createTestDataset()
      const other = await createTestDataset()
      await createTerm({ datasetId: ds.id, slot: 'sample_stabilisation', text: 'cold fixed' })
      await createTerm({ datasetId: ds.id, text: 'garbage', status: 'rejected', note: 'not a disease' })
      await createTerm({ datasetId: other.id, text: 'elsewhere' })

      expect(await doQuery(statusQuery, { datasetId: ds.id }, { context: userContext })).toEqual([
        { slot: 'disease', text: 'garbage', status: 'REJECTED', note: 'not a disease' },
        { slot: 'sample_stabilisation', text: 'cold fixed', status: 'PENDING', note: null },
      ])
      expect(await asAdmin(statusQuery, { datasetId: ds.id })).toHaveLength(2)
    })

    it('is refused to a user without edit rights', async() => {
      const stranger = await createTestUser()
      const ds = await createTestDataset({ userId: stranger.id })
      await createTerm({ datasetId: ds.id, text: 'secret' })

      await expect(doQuery(statusQuery, { datasetId: ds.id }, { context: userContext }))
        .rejects.toThrow(/Access denied/)
    })
  })

  describe('queries', () => {
    const setup = async() => {
      const alice = await createTestUser({ name: 'Alice' })
      const bob = await createTestUser({ name: 'Bob' })
      const d1 = await createTestDataset({ userId: alice.id }, { uploadDt: utc('2026-10-01'), name: 'ds one' })
      const d2 = await createTestDataset({ userId: bob.id }, { uploadDt: utc('2026-10-05'), name: 'ds two' })
      const d3 = await createTestDataset({ userId: alice.id }, { uploadDt: utc('2026-10-09'), name: 'ds three' })
      const older = await createTerm({
        datasetId: d1.id, text: 'Disease alpha', submitterId: alice.id, createdAt: new Date('2026-10-02'),
      })
      // the submitter column is what the filter reads, not the dataset's current owner
      const newer = await createTerm({
        datasetId: d3.id,
        slot: 'sample_stabilisation',
        text: 'Cold fixed',
        submitterId: bob.id,
        createdAt: new Date('2026-10-10'),
      })
      const approved = await createTerm({
        datasetId: d2.id, text: 'Disease approved', status: 'approved', canonicalLabel: 'Approved',
      })
      return { alice, bob, d1, d2, d3, older, newer, approved }
    }

    it('lists mapped rows under APPROVED and counts them as approved', async() => {
      const { alice, approved } = await setup()
      const d4 = await createTestDataset({ userId: alice.id }, { uploadDt: utc('2026-10-11'), name: 'ds four' })
      const mapped = await createTerm({
        datasetId: d4.id,
        slot: 'disease',
        text: 'Melanoma typo',
        status: 'mapped',
        ontologyId: 'MONDO:1',
        canonicalLabel: 'Melanoma',
        submitterId: alice.id,
      })

      const page = await asAdmin(termsQuery, { status: 'APPROVED' })
      expect(page.statusCounts).toEqual({ pending: 2, approved: 2, rejected: 0 })
      expect(page.total).toEqual(2)
      expect(page.terms.map((t: any) => [t.id, t.status]).sort()).toEqual(
        [[approved.id, 'APPROVED'], [mapped.id, 'MAPPED']].sort()
      )
    })

    it('lists pending rows with their dataset, status counts and filters', async() => {
      const { alice, bob, d1, d3, older, newer } = await setup()

      const page = await asAdmin(termsQuery, { status: 'PENDING' })
      expect(page.total).toEqual(2)
      expect(page.statusCounts).toEqual({ pending: 2, approved: 1, rejected: 0 })
      // newest row first by default
      expect(page.terms.map((t: any) => t.id)).toEqual([newer.id, older.id])
      expect(page.terms[1]).toMatchObject({
        status: 'PENDING',
        applyState: 'IDLE',
        datasetId: d1.id,
        datasetName: 'ds one',
        submittedAt: '2026-10-01T00:00:00.000Z',
        submitter: { id: alice.id, name: 'Alice' },
        decidedBy: null,
        createdAt: '2026-10-02T00:00:00.000Z',
      })
      expect(page.terms[0]).toMatchObject({ datasetId: d3.id, datasetName: 'ds three', submitter: { id: bob.id } })

      const bySlot = await asAdmin(termsQuery, { slot: 'disease' })
      expect(bySlot.terms.map((t: any) => t.id)).toEqual([older.id])
      expect(bySlot.statusCounts).toEqual({ pending: 1, approved: 1, rejected: 0 })

      const byQuery = await asAdmin(termsQuery, { query: 'dis' })
      expect(byQuery.terms.map((t: any) => t.id)).toEqual([older.id])
      expect(byQuery.total).toEqual(1)
      // the label of the approved row matches too
      const byLabel = await asAdmin(termsQuery, { status: 'APPROVED', query: 'appro' })
      expect(byLabel.terms.map((t: any) => t.canonicalLabel)).toEqual(['Approved'])

      expect((await asAdmin(termsQuery, { submitterId: bob.id })).terms.map((t: any) => t.id)).toEqual([newer.id])
      expect((await asAdmin(termsQuery, { submitterId: alice.id })).terms.map((t: any) => t.id)).toEqual([older.id])
      expect((await asAdmin(termsQuery, { submitterId: adminUser.id })).terms).toEqual([])

      expect((await asAdmin(termsQuery, { orderBy: 'TEXT' })).terms.map((t: any) => t.text))
        .toEqual(['Cold fixed', 'Disease alpha'])
      expect((await asAdmin(termsQuery, { orderBy: 'FIRST_SUBMITTED' })).terms.map((t: any) => t.id))
        .toEqual([newer.id, older.id])
      expect((await asAdmin(termsQuery, { limit: 1, offset: 1 })).terms.map((t: any) => t.id)).toEqual([older.id])

      await expect(asAdmin(termsQuery, { slot: 'not_a_slot' })).rejects.toThrow(/Unknown field/)
    })

    it('a row without a submitter lists a null submitter', async() => {
      const row = await createTerm({ text: 'orphan' })

      expect(await asAdmin(termQuery, { id: row.id })).toMatchObject({ id: row.id, submitter: null })
    })

    it('curationTerm returns one row with its dataset', async() => {
      const { older, d1 } = await setup()

      const term = await asAdmin(termQuery, { id: older.id })

      expect(term).toMatchObject({ id: older.id, text: 'Disease alpha', datasetId: d1.id, datasetName: 'ds one' })
      expect(await asAdmin(termQuery, { id: '00000000-0000-0000-0000-000000000000' })).toBeNull()
    })

    it('approvedCurationValues returns each approved label once', async() => {
      await createTerm({ text: 'disease one', status: 'approved', canonicalLabel: 'Disease One' })
      await createTerm({ text: 'Disease One', status: 'approved', canonicalLabel: 'Disease One' })
      await createTerm({ text: 'disease zero', status: 'approved', canonicalLabel: 'Disease Zero' })

      expect(await doQuery(valuesQuery, { slot: 'disease', query: 'disease' }, { context: userContext }))
        .toEqual(['Disease One', 'Disease Zero'])
    })

    it('approvedCurationValues is public and matches label and alias', async() => {
      await createTerm({
        slot: 'sample_stabilisation',
        text: 'fresh frozen',
        status: 'approved',
        canonicalLabel: 'Fresh frozen',
        aliases: ['snap frozen'],
      })
      await createTerm({ slot: 'sample_stabilisation', text: 'frozen pending' })
      await createTerm({ text: 'frozen disease', status: 'approved', canonicalLabel: 'Frozen disease' })

      const values = (query: string) =>
        doQuery(valuesQuery, { slot: 'sample_stabilisation', query }, { context: userContext })
      expect(await values('froz')).toEqual(['Fresh frozen'])
      expect(await values('SNAP')).toEqual(['Fresh frozen'])
      expect(await values('nothing')).toEqual([])
      await expect(doQuery(valuesQuery, { slot: 'nope', query: 'x' }, { context: userContext }))
        .rejects.toThrow(/Unknown field/)
    })
  })

  describe('approve', () => {
    it('approve stores label, note, decider and starts the apply', async() => {
      const row = await createTerm({ text: 'Disese one' })

      const result = await asAdmin(approveMutation, {
        input: { ids: [row.id], canonicalLabel: 'Disease One', aliases: ['Disease  1 (x)', 'disease 1', 'Disese one'], note: 'n' },
      })

      expect(result.skipped).toEqual(0)
      expect(result.terms).toEqual([expect.objectContaining({
        id: row.id,
        status: 'APPROVED',
        canonicalLabel: 'Disease One',
        aliases: ['disease 1'],
        note: 'n',
        decidedBy: { id: adminUser.id },
        decidedAt: expect.stringMatching(/^\d{4}-/),
      })])
      const stored = await reload(row.id)
      expect(stored).toMatchObject({
        status: 'approved',
        canonicalLabel: 'Disease One',
        aliases: ['disease 1'],
        note: 'n',
        decidedById: adminUser.id,
      })
      expect(stored!.decidedAt).toBeInstanceOf(Date)
      expect(mockApply).toHaveBeenCalledTimes(1)
      expect(mockApply).toHaveBeenCalledWith(expect.anything(), row.id)
    })

    it('approving a row leaves a row of the same text on another dataset pending', async() => {
      const row = await createTerm({ text: 'disease one' })
      const sameText = await createTerm({ text: 'disease one' })
      const aliasText = await createTerm({ text: 'disease uno' })
      await createTerm({ text: 'disease 1', status: 'mapped', canonicalLabel: 'X', ontologyId: 'MONDO:1' })
      expect(row.datasetId).not.toEqual(sameText.datasetId)

      const result = await asAdmin(approveMutation, { input: { ids: [row.id], aliases: ['Disease Uno', 'disease 1'] } })

      expect(result.terms.map((t: any) => t.id)).toEqual([row.id])
      expect(await reload(row.id)).toMatchObject({ status: 'approved', aliases: ['disease uno', 'disease 1'] })
      expect(await reload(sameText.id)).toMatchObject({ status: 'pending', aliases: [], decidedById: null })
      expect(await reload(aliasText.id)).toMatchObject({ status: 'pending', decidedById: null })
      expect(appliedIds()).toEqual([row.id])
    })

    it("bulk approve keeps each row's own text as label", async() => {
      const a = await createTerm({ text: 'Alpha Text' })
      const b = await createTerm({ text: 'Beta Text' })

      const result = await asAdmin(approveMutation, { input: { ids: [a.id, b.id], canonicalLabel: 'Ignored' } })

      expect(result.terms.map((t: any) => [t.id, t.status, t.canonicalLabel]).sort())
        .toEqual([[a.id, 'APPROVED', 'Alpha Text'], [b.id, 'APPROVED', 'Beta Text']].sort())
      expect((await reload(a.id))!.canonicalLabel).toEqual('Alpha Text')
      expect((await reload(b.id))!.canonicalLabel).toEqual('Beta Text')
      expect(appliedIds().sort()).toEqual([a.id, b.id].sort())
    })
  })

  describe('running apply', () => {
    it('approve refuses a row whose apply is running', async() => {
      const decidedAt = new Date()
      const row = await createTerm({
        text: 'busy one', status: 'approved', canonicalLabel: 'Busy', applyState: 'running', decidedAt,
      })

      await expect(asAdmin(approveMutation, { input: { ids: [row.id], canonicalLabel: 'Other' } }))
        .rejects.toThrow(/An apply is still running for "busy one"/)
      await expect(asAdmin(rejectMutation, { input: { ids: [row.id], note: 'n' } }))
        .rejects.toThrow(/An apply is still running for "busy one"/)

      expect(await reload(row.id)).toMatchObject({
        status: 'approved', canonicalLabel: 'Busy', applyState: 'running', decidedById: null, decidedAt,
      })
      expect(mockApply).not.toHaveBeenCalled()
    })

    it('a stale running row can be re-decided', async() => {
      const row = await createTerm({
        text: 'stuck one',
        status: 'approved',
        canonicalLabel: 'Stuck',
        applyState: 'running',
        decidedAt: new Date(Date.now() - 11 * 60 * 1000),
      })

      const result = await asAdmin(approveMutation, { input: { ids: [row.id], canonicalLabel: 'Unstuck' } })

      expect(result.terms).toEqual([expect.objectContaining({ id: row.id, canonicalLabel: 'Unstuck' })])
      expect(appliedIds()).toEqual([row.id])
    })

    it('retry stamps a fresh decidedAt', async() => {
      const oldDecidedAt = new Date(Date.now() - 60 * 60 * 1000)
      const row = await createTerm({
        text: 'failed again',
        status: 'approved',
        canonicalLabel: 'F',
        applyState: 'failed',
        appliedCount: 3,
        decidedAt: oldDecidedAt,
      })
      const before = Date.now()

      const result = await asAdmin(retryMutation, { id: row.id })

      expect(result).toMatchObject({ id: row.id, applyState: 'RUNNING', appliedCount: 0 })
      const stored = await reload(row.id)
      expect(stored).toMatchObject({ applyState: 'running', appliedCount: 0 })
      expect(stored!.decidedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000)
      // a second retry right away is refused: the fresh stamp makes the running apply current
      await expect(asAdmin(retryMutation, { id: row.id })).rejects.toThrow(/cannot be retried/)
      expect(appliedIds()).toEqual([row.id])
    })
  })

  describe('map', () => {
    beforeEach(async() => {
      await insertOntologyTerm('MONDO:1', 'MONDO:0000001', 'Melanoma')
      await insertOntologyTerm('UBERON:1', 'UBERON:0000000', 'Liver')
    })

    it('map with a CURIE outside the slot subtrees fails', async() => {
      const row = await createTerm({ text: 'melanomma' })

      for (const ontologyId of ['UBERON:1', 'MONDO:404']) {
        await expect(asAdmin(mapMutation, { input: { ids: [row.id], ontologyId } }))
          .rejects.toThrow(/Unknown term for this field/)
      }
      expect(await reload(row.id)).toMatchObject({ status: 'pending', ontologyId: null })
      expect(mockApply).not.toHaveBeenCalled()

      const result = await asAdmin(mapMutation, { input: { ids: [row.id], ontologyId: 'MONDO:1', note: 'typo' } })

      expect(result.terms).toEqual([expect.objectContaining({
        status: 'MAPPED', ontologyId: 'MONDO:1', canonicalLabel: 'Melanoma', note: 'typo',
      })])
      expect(await reload(row.id)).toMatchObject({
        status: 'mapped', ontologyId: 'MONDO:1', canonicalLabel: 'Melanoma', decidedById: adminUser.id,
      })
      expect(mockApply).toHaveBeenCalledWith(expect.anything(), row.id)
    })

    it('map useSuggested skips rows without a suggestion and reports skipped', async() => {
      const suggested = await createTerm({ text: 'melanomma', suggestedOntologyId: 'MONDO:1', suggestedLabel: 'Melanoma' })
      const plain = await createTerm({ text: 'something else' })

      const result = await asAdmin(mapMutation, { input: { ids: [suggested.id, plain.id], useSuggested: true } })

      expect(result.skipped).toEqual(1)
      expect(result.terms.map((t: any) => [t.id, t.status, t.ontologyId])).toEqual([[suggested.id, 'MAPPED', 'MONDO:1']])
      expect(await reload(plain.id)).toMatchObject({ status: 'pending', decidedById: null })
      expect(appliedIds()).toEqual([suggested.id])
    })

    it('map useSuggested skips a row whose suggestion is no longer a term of the field', async() => {
      const stale = await createTerm({ text: 'old suggestion', suggestedOntologyId: 'MONDO:404', suggestedLabel: 'Gone' })
      const outside = await createTerm({ text: 'liverish', suggestedOntologyId: 'UBERON:1', suggestedLabel: 'Liver' })
      const fresh = await createTerm({ text: 'melanomma', suggestedOntologyId: 'MONDO:1', suggestedLabel: 'Melanoma' })

      const result = await asAdmin(mapMutation, { input: { ids: [stale.id, outside.id, fresh.id], useSuggested: true } })

      expect(result.skipped).toEqual(2)
      expect(result.terms.map((t: any) => [t.id, t.status, t.ontologyId])).toEqual([[fresh.id, 'MAPPED', 'MONDO:1']])
      expect(await reload(stale.id)).toMatchObject({ status: 'pending', ontologyId: null, decidedById: null })
      expect(await reload(outside.id)).toMatchObject({ status: 'pending', ontologyId: null, decidedById: null })
      expect(appliedIds()).toEqual([fresh.id])
    })

    it('map an unbound slot to an approved target adds the alias to the target', async() => {
      const target = await createTerm({
        slot: 'sample_stabilisation', text: 'fresh frozen', status: 'approved', canonicalLabel: 'Fresh frozen',
      })
      const pendingTarget = await createTerm({ slot: 'sample_stabilisation', text: 'pending target' })
      const row = await createTerm({ slot: 'sample_stabilisation', text: 'Snap Frozen' })

      await expect(asAdmin(mapMutation, { input: { ids: [row.id], targetTermId: pendingTarget.id } }))
        .rejects.toThrow(/approved term/)
      await expect(asAdmin(mapMutation, { input: { ids: [row.id], ontologyId: 'MONDO:1' } }))
        .rejects.toThrow(/approved term/)

      const result = await asAdmin(mapMutation, { input: { ids: [row.id], targetTermId: target.id, note: 'same' } })

      // an unbound slot has no CURIE, so the row is accepted as free text under the target's label
      expect(result.terms).toEqual([expect.objectContaining({
        id: row.id, status: 'APPROVED', canonicalLabel: 'Fresh frozen', ontologyId: null, note: 'same',
      })])
      expect(await reload(target.id)).toMatchObject({ aliases: ['snap frozen'], status: 'approved' })
      expect(await reload(row.id)).toMatchObject({ datasetId: row.datasetId, decidedById: adminUser.id })
      expect(appliedIds()).toEqual([row.id])
    })

    it('bulk map-to-suggested approves an unbound row whose suggestion is a seed value', async() => {
      const row = await createTerm({ slot: 'tissue_modification', text: 'washedx', suggestedLabel: 'Washed' })

      const result = await asAdmin(mapMutation, { input: { ids: [row.id], useSuggested: true } })

      expect(result.skipped).toEqual(0)
      expect(result.terms).toEqual([expect.objectContaining({
        id: row.id, status: 'APPROVED', canonicalLabel: 'Washed', ontologyId: null,
      })])
      expect(await reload(row.id)).toMatchObject({ status: 'approved', canonicalLabel: 'Washed', decidedById: adminUser.id })
      expect(appliedIds()).toEqual([row.id])
    })

    it('bulk map-to-suggested approves an unbound row whose suggestion is an approved label', async() => {
      const target = await createTerm({
        slot: 'sample_stabilisation', text: 'cryo frozen', status: 'approved', canonicalLabel: 'Cryo frozen',
      })
      const row = await createTerm({ slot: 'sample_stabilisation', text: 'cryofrozen', suggestedLabel: 'cryo frozen' })

      const result = await asAdmin(mapMutation, { input: { ids: [row.id], useSuggested: true } })

      expect(result.skipped).toEqual(0)
      expect(await reload(row.id)).toMatchObject({ status: 'approved', canonicalLabel: 'Cryo frozen' })
      expect(await reload(target.id)).toMatchObject({ aliases: ['cryofrozen'], status: 'approved' })
      expect(appliedIds()).toEqual([row.id])
    })

    it('still skips an unbound row whose suggestion is neither a seed nor an approved label', async() => {
      const row = await createTerm({ slot: 'tissue_modification', text: 'scrubbed', suggestedLabel: 'Scrubbed' })

      const result = await asAdmin(mapMutation, { input: { ids: [row.id], useSuggested: true } })

      expect(result).toEqual({ terms: [], skipped: 1 })
      expect(await reload(row.id)).toMatchObject({ status: 'pending', canonicalLabel: null, decidedById: null })
      expect(mockApply).not.toHaveBeenCalled()
    })
  })

  describe('reject', () => {
    it('reject requires a note and does not start an apply on a pending row', async() => {
      const row = await createTerm({ text: 'garbage' })

      await expect(asAdmin(rejectMutation, { input: { ids: [row.id], note: '  ' } }))
        .rejects.toThrow(/A reason is required/)
      expect((await reload(row.id))!.status).toEqual('pending')

      const result = await asAdmin(rejectMutation, { input: { ids: [row.id], note: 'not a disease' } })

      expect(result.terms).toEqual([expect.objectContaining({ status: 'REJECTED', note: 'not a disease' })])
      expect(await reload(row.id)).toMatchObject({ status: 'rejected', note: 'not a disease', decidedById: adminUser.id })
      expect(mockApply).not.toHaveBeenCalled()
    })

    it('reject on an approved row starts the apply', async() => {
      const row = await createTerm({ text: 'wrongly approved', status: 'approved', canonicalLabel: 'Wrong' })

      await asAdmin(rejectMutation, { input: { ids: [row.id], note: 'mistake' } })

      expect((await reload(row.id))!.status).toEqual('rejected')
      expect(mockApply).toHaveBeenCalledWith(expect.anything(), row.id)
    })
  })

  it('retryCurationApply restarts a failed row', async() => {
    const failed = await createTerm({ text: 'failed one', status: 'approved', canonicalLabel: 'F', applyState: 'failed' })
    const running = await createTerm({
      text: 'running one', status: 'approved', canonicalLabel: 'R', applyState: 'running', decidedAt: new Date(),
    })
    const stale = await createTerm({
      text: 'stale one',
      status: 'approved',
      canonicalLabel: 'S',
      applyState: 'running',
      decidedAt: new Date(Date.now() - 11 * 60 * 1000),
    })

    expect(await asAdmin(retryMutation, { id: failed.id })).toMatchObject({ id: failed.id, applyState: 'RUNNING' })
    expect(await asAdmin(retryMutation, { id: stale.id })).toMatchObject({ id: stale.id })
    await expect(asAdmin(retryMutation, { id: running.id })).rejects.toThrow(/cannot be retried/)

    expect(appliedIds()).toEqual([failed.id, stale.id])
  })
})
