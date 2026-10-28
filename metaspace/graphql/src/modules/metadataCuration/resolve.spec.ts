import {
  adminUser,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testEntityManager,
  testUser,
} from '../../tests/graphqlTestEnvironment'
import { clearOntologyTermSuggestionCache } from '../lookups/controller'
import { LegacyMetadata, MetadataV2Envelope, OntologyTermValue, upProjectToV2 } from '../dataset/projection'
import { createTestDataset } from '../../tests/testDataCreation'
import { MetadataCurationTerm } from './model'
import { CURATION_SLOTS, curationSlot, getSlotValue, setSlotValue } from './slots'
import { prunePendingRows } from './queue'
import { resolveCurationStates } from './resolve'

const SUBTREE = 'MONDO:0000001'

const baseIms: LegacyMetadata = {
  Data_Type: 'Imaging MS',
  Sample_Information: { Organism: 'Mus musculus', Organism_Part: 'liver', Condition: 'wildtype' },
  Sample_Preparation: {
    Sample_Stabilisation: 'fresh frozen',
    Tissue_Modification: 'none',
    MALDI_Matrix: 'DHB',
    MALDI_Matrix_Application: 'sublimation',
  },
  MS_Analysis: {
    Polarity: 'Positive',
    Ionisation_Source: 'MALDI',
    Analyzer: 'Orbitrap',
    Detector_Resolving_Power: { mz: 200, Resolving_Power: 140000 },
    Pixel_Size: { Xaxis: 20, Yaxis: 20 },
  },
}

const FIXED: OntologyTermValue = { value_ontology_id: 'TEST:0', value_label: 'Fixed', curation_state: 'controlled' }

/** An envelope whose curated slots are all controlled except `slot`, which holds `value`. */
const envelopeWith = (slot: string, value: OntologyTermValue): MetadataV2Envelope => {
  const envelope = upProjectToV2(baseIms)
  for (const s of CURATION_SLOTS) {
    if (getSlotValue(envelope.document, s)) {
      setSlotValue(envelope.document, s, { ...FIXED })
    }
  }
  setSlotValue(envelope.document, curationSlot(slot)!, value)
  return envelope
}

const pending = (text: string | undefined): OntologyTermValue =>
  ({ value_free_text: text, curation_state: 'pending_curation' })

const valueOf = (envelope: MetadataV2Envelope, slot: string) => getSlotValue(envelope.document, curationSlot(slot)!)

const insertTerms = async(rows: [string, string, string[]][]) => {
  for (const [curie, label, synonyms] of rows) {
    await testEntityManager.query(
      'INSERT INTO public.ontology_term (curie, subtree, label, synonyms, ontology) VALUES ($1, $2, $3, $4, $5)',
      [curie, SUBTREE, label, synonyms, 'mondo']
    )
  }
}

const saveTerm = (term: Partial<MetadataCurationTerm>) =>
  testEntityManager.save(Object.assign(new MetadataCurationTerm(), term))

const rowCount = () => testEntityManager.count(MetadataCurationTerm)
const rowsOf = (datasetId: string) => testEntityManager.find(MetadataCurationTerm, { datasetId })

const APPROVED_FRESH_FROZEN: Partial<MetadataCurationTerm> = {
  slot: 'sample_stabilisation',
  normalizedText: 'fresh frozen',
  text: 'Fresh frozen',
  status: 'approved',
  canonicalLabel: 'Fresh frozen',
  decidedAt: new Date('2026-01-01T00:00:00Z'),
}

describe('metadata curation resolution', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  let ds: string // the dataset being saved
  let other: string // another dataset of another user
  beforeEach(async() => {
    clearOntologyTermSuggestionCache()
    await onBeforeEach()
    await setupTestUsers()
    ds = (await createTestDataset({ userId: testUser.id })).id
    other = (await createTestDataset({ userId: adminUser.id })).id
  })
  afterEach(onAfterEach)

  const resolve = (slot: string, value: OntologyTermValue, datasetId = ds, submitterId: string | null = testUser.id) =>
    resolveCurationStates(envelopeWith(slot, value), testEntityManager, datasetId, submitterId)

  describe('resolveCurationStates', () => {
    it('exact ontology label becomes controlled and keeps the typed text', async() => {
      await insertTerms([['MONDO:1', 'Melanoma', []]])

      const { envelope, errors } = await resolve('disease', pending('melanoma '))

      expect(valueOf(envelope, 'disease')).toEqual({
        value_ontology_id: 'MONDO:1',
        value_label: 'Melanoma',
        value_free_text: 'melanoma ',
        curation_state: 'controlled',
      })
      expect(errors).toEqual([])
      expect(await rowCount()).toEqual(0)
    })

    it('label beats synonym', async() => {
      await insertTerms([['MONDO:1', 'Melanoma', []], ['MONDO:2', 'Skin cancer', ['melanoma']]])

      const { envelope } = await resolve('disease', pending('Melanoma'))

      expect(valueOf(envelope, 'disease')).toEqual({
        value_ontology_id: 'MONDO:1',
        value_label: 'Melanoma',
        value_free_text: 'Melanoma',
        curation_state: 'controlled',
      })
      expect(await rowCount()).toEqual(0)
    })

    it('two labels is ambiguous: stays pending and writes this dataset\'s row', async() => {
      await insertTerms([['MONDO:1', 'Melanoma', []], ['MONDO:4', 'Melanoma', []]])

      const { envelope } = await resolve('disease', pending('melanoma'))

      expect(valueOf(envelope, 'disease')).toEqual(pending('melanoma'))
      const rows = await testEntityManager.find(MetadataCurationTerm)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        slot: 'disease', normalizedText: 'melanoma', status: 'pending', datasetId: ds, submitterId: testUser.id,
      })
    })

    it('own rejected row reports an error and leaves the value', async() => {
      await saveTerm({
        slot: 'disease',
        datasetId: ds,
        normalizedText: 'asdf',
        text: 'asdf',
        status: 'rejected',
        note: 'use a listed value',
      })
      await saveTerm({
        slot: 'organism',
        datasetId: ds,
        normalizedText: 'qwerty',
        text: 'qwerty',
        status: 'rejected',
        note: '',
      })

      const withNote = await resolve('disease', pending('asdf'))
      expect(withNote.errors).toEqual([{
        dataPath: '.metadataV2.document.sample.disease',
        message: '"asdf" was rejected by a curator: use a listed value',
      }])
      expect(valueOf(withNote.envelope, 'disease')).toEqual(pending('asdf'))

      const withoutNote = await resolve('organism', pending('Qwerty'))
      expect(withoutNote.errors).toEqual([{
        dataPath: '.metadataV2.document.sample.organism',
        message: '"Qwerty" was rejected by a curator',
      }])
      expect(valueOf(withoutNote.envelope, 'organism')).toEqual(pending('Qwerty'))

      expect(await rowCount()).toEqual(2)
      expect((await rowsOf(ds)).map(r => r.status)).toEqual(['rejected', 'rejected'])
    })

    it('own approved row resolves to accepted', async() => {
      await saveTerm({ ...APPROVED_FRESH_FROZEN, datasetId: ds })

      const { envelope, errors } = await resolve('sample_stabilisation', pending('FRESH FROZEN'))

      expect(valueOf(envelope, 'sample_stabilisation')).toEqual({
        value_label: 'Fresh frozen',
        value_free_text: 'FRESH FROZEN',
        curation_state: 'free_text_accepted',
      })
      expect(errors).toEqual([])
      expect(await rowCount()).toEqual(1)
      expect(await rowsOf(ds)).toMatchObject([{ datasetId: ds, status: 'approved' }])
    })

    it('own mapped row resolves to controlled', async() => {
      await saveTerm({
        slot: 'disease',
        datasetId: ds,
        normalizedText: 'melanom',
        text: 'Melanom',
        status: 'mapped',
        ontologyId: 'MONDO:1',
        canonicalLabel: 'Melanoma',
      })

      const { envelope } = await resolve('disease', pending('Melanom'))

      expect(valueOf(envelope, 'disease')).toEqual({
        value_ontology_id: 'MONDO:1',
        value_label: 'Melanoma',
        value_free_text: 'Melanom',
        curation_state: 'controlled',
      })
      expect(await rowCount()).toEqual(1)
      expect(await rowsOf(ds)).toMatchObject([{ datasetId: ds, status: 'mapped' }])
    })

    it('own pending row is left unchanged', async() => {
      const row = await saveTerm({
        slot: 'disease',
        datasetId: ds,
        normalizedText: 'disease 1',
        text: 'Disease 1',
        submitterId: adminUser.id,
      })

      const { envelope, errors } = await resolve('disease', pending('disease 1'))

      expect(valueOf(envelope, 'disease')).toEqual(pending('disease 1'))
      expect(errors).toEqual([])
      expect(await rowCount()).toEqual(1)
      expect(await testEntityManager.findOneOrFail(MetadataCurationTerm, row.id)).toMatchObject({
        datasetId: ds, submitterId: adminUser.id, status: 'pending', text: 'Disease 1',
      })
    })

    it('latest decision of another dataset resolves without writing a row', async() => {
      await saveTerm({ ...APPROVED_FRESH_FROZEN, datasetId: other, submitterId: adminUser.id })

      const { envelope } = await resolve('sample_stabilisation', pending('Fresh Frozen'))

      expect(valueOf(envelope, 'sample_stabilisation')).toEqual({
        value_label: 'Fresh frozen',
        value_free_text: 'Fresh Frozen',
        curation_state: 'free_text_accepted',
      })
      expect(await rowCount()).toEqual(1)
      expect(await rowsOf(ds)).toEqual([])
      expect(await rowsOf(other)).toMatchObject([{ datasetId: other, submitterId: adminUser.id, status: 'approved' }])
    })

    it('alias of another dataset\'s approved row resolves too', async() => {
      await saveTerm({ ...APPROVED_FRESH_FROZEN, datasetId: other, aliases: ['flash frozen'] })

      const { envelope } = await resolve('sample_stabilisation', pending('Flash frozen'))

      expect(valueOf(envelope, 'sample_stabilisation')).toEqual({
        value_label: 'Fresh frozen',
        value_free_text: 'Flash frozen',
        curation_state: 'free_text_accepted',
      })
      expect(await rowCount()).toEqual(1)
      expect(await rowsOf(ds)).toEqual([])
    })

    it('another dataset\'s rejection is ignored and this dataset gets its own pending row', async() => {
      await saveTerm({
        slot: 'disease',
        datasetId: other,
        normalizedText: 'asdf',
        text: 'asdf',
        status: 'rejected',
        note: 'not for that dataset',
      })

      const { envelope, errors } = await resolve('disease', pending('asdf'))

      expect(errors).toEqual([])
      expect(valueOf(envelope, 'disease')).toEqual(pending('asdf'))
      expect(await rowCount()).toEqual(2)
      expect(await rowsOf(ds)).toMatchObject([
        { slot: 'disease', normalizedText: 'asdf', datasetId: ds, submitterId: testUser.id, status: 'pending' },
      ])
      expect(await rowsOf(other)).toMatchObject([{ status: 'rejected' }])
    })

    it('two decisions of other datasets: the latest wins', async() => {
      const third = (await createTestDataset({ userId: adminUser.id })).id
      await saveTerm({
        slot: 'disease',
        datasetId: other,
        normalizedText: 'melanom',
        text: 'melanom',
        status: 'approved',
        canonicalLabel: 'Old label',
        decidedAt: new Date('2026-01-01T00:00:00Z'),
      })
      await saveTerm({
        slot: 'disease',
        datasetId: third,
        normalizedText: 'melanom',
        text: 'Melanom',
        status: 'mapped',
        ontologyId: 'MONDO:1',
        canonicalLabel: 'Melanoma',
        decidedAt: new Date('2026-02-01T00:00:00Z'),
      })

      const { envelope } = await resolve('disease', pending('MELANOM'))

      expect(valueOf(envelope, 'disease')).toEqual({
        value_ontology_id: 'MONDO:1',
        value_label: 'Melanoma',
        value_free_text: 'MELANOM',
        curation_state: 'controlled',
      })
      expect(await rowCount()).toEqual(2)
      expect(await rowsOf(ds)).toEqual([])
    })

    it('unknown text writes one pending row for the dataset with submitter and suggestion', async() => {
      // The suggestion's typo stage runs on its own pooled connection, which cannot see this test's
      // uncommitted rows: commit the ontology row and clean up. The curie and label are unique to this
      // file, so a parallel spec can neither collide with the committed row nor match it.
      const committed = testEntityManager.connection
      await committed.query(
        'INSERT INTO public.ontology_term (curie, subtree, label, synonyms, ontology) VALUES ($1, $2, $3, $4, $5)',
        ['MONDO:9002', SUBTREE, 'Quuxoma', [], 'mondo']
      )
      try {
        const first = await resolve('disease', pending('quuxona'))
        const second = await resolve('disease', pending('Quuxona '))

        const rows = await testEntityManager.find(MetadataCurationTerm)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
          slot: 'disease',
          normalizedText: 'quuxona',
          text: 'quuxona',
          status: 'pending',
          datasetId: ds,
          submitterId: testUser.id,
          suggestedOntologyId: 'MONDO:9002',
          suggestedLabel: 'Quuxoma',
        })
        expect(rows[0].suggestedScore).toBeGreaterThan(0)
        expect(valueOf(first.envelope, 'disease')).toEqual(pending('quuxona'))
        expect(valueOf(second.envelope, 'disease')).toEqual(pending('Quuxona '))
      } finally {
        await committed.query('DELETE FROM public.ontology_term WHERE curie = $1', ['MONDO:9002'])
      }
    })

    it('the same unknown text on two datasets makes two rows', async() => {
      await resolve('disease', pending('Disease 1'))
      await resolve('disease', pending('disease 1'), other, adminUser.id)

      expect(await rowsOf(ds)).toMatchObject([{ datasetId: ds, submitterId: testUser.id, status: 'pending' }])
      expect(await rowsOf(other)).toMatchObject([{ datasetId: other, submitterId: adminUser.id, status: 'pending' }])
      expect(await rowCount()).toEqual(2)
    })

    it('unknown text on an unbound slot is suggested from approved rows', async() => {
      await saveTerm({ ...APPROVED_FRESH_FROZEN, datasetId: other })

      await resolve('sample_stabilisation', pending('fresh frozn'))

      const [row] = await rowsOf(ds)
      expect(row).toMatchObject({
        normalizedText: 'fresh frozn',
        status: 'pending',
        datasetId: ds,
        submitterId: testUser.id,
        suggestedOntologyId: null,
        suggestedLabel: 'Fresh frozen',
      })
      expect(row.suggestedScore).toBeGreaterThanOrEqual(0.5)
      expect(await rowCount()).toEqual(2)
    })

    it('a seed value is suggested for an unbound slot', async() => {
      await resolve('tissue_modification', pending('washedx'))

      const [row] = await rowsOf(ds)
      expect(row).toMatchObject({
        normalizedText: 'washedx',
        status: 'pending',
        suggestedOntologyId: null,
        suggestedLabel: 'Washed',
      })
      expect(row.suggestedScore).toBeGreaterThanOrEqual(0.5)
      expect(row.suggestedScore).toBeLessThan(1)
    })

    it('a seed value with a parenthetical is suggested as itself', async() => {
      await resolve('sample_stabilisation', pending('Flash frozen (liquid nitrogen)'))

      const [row] = await rowsOf(ds)
      expect(row).toMatchObject({
        normalizedText: 'flash frozen',
        status: 'pending',
        suggestedOntologyId: null,
        suggestedLabel: 'Flash frozen (liquid nitrogen)',
      })
    })

    it('nothing is suggested below the threshold', async() => {
      await resolve('tissue_modification', pending('zzzz'))

      const [row] = await rowsOf(ds)
      expect(row).toMatchObject({
        normalizedText: 'zzzz',
        status: 'pending',
        suggestedOntologyId: null,
        suggestedLabel: null,
        suggestedScore: null,
      })
    })

    it('changed text replaces a decided row', async() => {
      const decided = await saveTerm({
        ...APPROVED_FRESH_FROZEN,
        datasetId: ds,
        submitterId: testUser.id,
        aliases: ['flash frozen'],
        note: 'ok',
        decidedById: adminUser.id,
        applyState: 'done',
        appliedCount: 1,
      })

      const { envelope } = await resolve('sample_stabilisation', pending('Cryo fixed'))

      expect(valueOf(envelope, 'sample_stabilisation')).toEqual(pending('Cryo fixed'))
      expect(await rowCount()).toEqual(1)
      const row = await testEntityManager.findOneOrFail(MetadataCurationTerm, decided.id)
      expect(row).toMatchObject({
        datasetId: ds,
        submitterId: testUser.id,
        text: 'Cryo fixed',
        normalizedText: 'cryo fixed',
        status: 'pending',
        canonicalLabel: null,
        ontologyId: null,
        aliases: [],
        note: null,
        decidedById: null,
        decidedAt: null,
        applyState: 'idle',
        appliedCount: 0,
      })
    })

    it('placeholder and empty values never write a row', async() => {
      for (const text of ['N/A', '', '   ', '(none)', undefined]) {
        const { envelope } = await resolve('sample_stabilisation', pending(text))
        expect(valueOf(envelope, 'sample_stabilisation')).toEqual(pending(text))
      }
      expect(await rowCount()).toEqual(0)
    })

    it('text that normalises to empty is left pending without a row', async() => {
      const { envelope, errors } = await resolve('anatomical_site_coarse', pending('(liver)'))

      expect(valueOf(envelope, 'anatomical_site_coarse')).toEqual(pending('(liver)'))
      expect(errors).toEqual([])
      expect(await rowCount()).toEqual(0)
    })

    it('controlled and accepted values are untouched', async() => {
      await saveTerm({
        slot: 'disease',
        datasetId: ds,
        normalizedText: 'asdf',
        text: 'asdf',
        status: 'rejected',
        note: 'no',
      })
      const values: OntologyTermValue[] = [
        { value_ontology_id: 'MONDO:9', value_label: 'Other', value_free_text: 'asdf', curation_state: 'controlled' },
        { value_label: 'asdf', value_free_text: 'asdf', curation_state: 'free_text_accepted' },
      ]
      for (const value of values) {
        const { envelope, errors } = await resolve('disease', { ...value })
        expect(valueOf(envelope, 'disease')).toEqual(value)
        expect(errors).toEqual([])
      }
      expect(await rowCount()).toEqual(1)
    })

    it('instrument_model is skipped', async() => {
      const envelope = envelopeWith('disease', { ...FIXED })
      envelope.document.acquisition.instrument_model.user_value = pending('Some new analyzer')

      const result = await resolveCurationStates(envelope, testEntityManager, ds, testUser.id)

      expect(result.envelope.document.acquisition.instrument_model.user_value).toEqual(pending('Some new analyzer'))
      expect(await rowCount()).toEqual(0)
    })
  })

  describe('prunePendingRows', () => {
    it('deletes pending rows of settled slots and keeps decided rows and still-pending values', async() => {
      await saveTerm({ slot: 'disease', datasetId: ds, normalizedText: 'disease 1', text: 'Disease 1' })
      await saveTerm({ ...APPROVED_FRESH_FROZEN, datasetId: ds })
      await saveTerm({ slot: 'organism', datasetId: ds, normalizedText: 'mouse x', text: 'Mouse X' })
      await saveTerm({ slot: 'tissue_modification', datasetId: ds, normalizedText: 'tm', text: 'tm' })
      const otherRow = await saveTerm({
        slot: 'disease',
        datasetId: other,
        normalizedText: 'disease 1',
        text: 'Disease 1',
      })

      const envelope = envelopeWith('organism', pending('Mouse X')) // every other slot is controlled
      setSlotValue(envelope.document, curationSlot('tissue_modification')!, pending('N/A'))
      await prunePendingRows(testEntityManager, ds, envelope)

      const left = (await rowsOf(ds)).map(r => [r.slot, r.status]).sort()
      expect(left).toEqual([['organism', 'pending'], ['sample_stabilisation', 'approved']])
      expect(await testEntityManager.findOne(MetadataCurationTerm, otherRow.id)).toBeDefined()
    })
  })
})
