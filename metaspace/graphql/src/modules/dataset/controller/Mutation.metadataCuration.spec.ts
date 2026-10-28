import {
  adminContext, adminUser, doQuery, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach,
  setupTestUsers, testEntityManager, testUser, userContext,
} from '../../../tests/graphqlTestEnvironment'
import { createTestDatasetWithEngineDataset } from '../../../tests/testDataCreation'
import { clearOntologyTermSuggestionCache } from '../../lookups/controller'
import { EngineDataset } from '../../engine/model'
import { MetadataCurationTerm } from '../../metadataCuration/model'
import { normalizeCurationText } from '../../metadataCuration/normalize'
import { LegacyMetadata, MetadataV2Envelope, OntologyTermValue, projectToLegacyMetadata, upProjectToV2 }
  from '../projection'

import * as _smApiDatasets from '../../../utils/smApi/datasets'
jest.mock('../../../utils/smApi/datasets')
const mockSmApiDatasets = _smApiDatasets as jest.Mocked<typeof _smApiDatasets>

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

const pending = (text: string): OntologyTermValue => ({ value_free_text: text, curation_state: 'pending_curation' })
const MELANOMA: OntologyTermValue = { value_ontology_id: 'MONDO:1', value_label: 'Melanoma', curation_state: 'controlled' }

const envelopeWith = (sample: Record<string, OntologyTermValue>): MetadataV2Envelope => {
  const envelope = upProjectToV2(baseIms)
  Object.assign(envelope.document.sample, sample)
  return envelope
}

const createDatasetQuery = 'mutation ($input: DatasetCreateInput!) { createDataset(input: $input) }'
const updateDatasetQuery = `mutation ($id: String!, $input: DatasetUpdateInput!) {
  updateDataset(id: $id, input: $input)
}`
const reprocessQuery = 'mutation ($id: String!, $input: DatasetCreateInput!) { createDataset(id: $id, input: $input) }'
const deleteDatasetQuery = 'mutation ($id: String!) { deleteDataset(id: $id) }'

const createInput = (metadataV2: MetadataV2Envelope) => ({
  name: 'ds-name',
  inputPath: 'input-path',
  metadataV2Json: JSON.stringify(metadataV2),
  adducts: ['+H'],
  isPublic: true,
  submitterId: '',
})

const createDataset = async(metadataV2: MetadataV2Envelope): Promise<string> =>
  JSON.parse(await doQuery(createDatasetQuery, { input: createInput(metadataV2) }, { context: userContext })).datasetId

/** An existing dataset whose stored v2 record is `metadataV2` (legacy-only when null), owned by `userId`. */
const existingDataset = async(metadataV2: MetadataV2Envelope | null, userId = testUser.id): Promise<string> => {
  const { dataset } = await createTestDatasetWithEngineDataset({ userId }, {
    metadata: metadataV2 ? projectToLegacyMetadata(metadataV2) : baseIms,
    metadataV2,
  } as Partial<EngineDataset>)
  return dataset.id
}

const updateDataset = (id: string, input: Record<string, string>) =>
  doQuery(updateDatasetQuery, { id, input }, { context: userContext })

/** Persists the envelope the (mocked) engine was last asked to store, as the real engine would. */
const storeUpdatedEnvelope = async(id: string) => {
  const updates = mockSmApiDatasets.smApiUpdateDataset.mock.calls
  await testEntityManager.update(EngineDataset, id, { metadataV2: updates[updates.length - 1][1].metadataV2 })
}

const lastAddDoc = () => {
  const calls = mockSmApiDatasets.smApiDatasetRequest.mock.calls
  return calls[calls.length - 1][1].doc
}

const insertOntologyTerm = (curie: string, label: string) => testEntityManager.query(
  'INSERT INTO public.ontology_term (curie, subtree, label, synonyms, ontology) VALUES ($1, $2, $3, $4, $5)',
  [curie, 'MONDO:0000001', label, [], 'mondo']
)

const saveTerm = (term: Partial<MetadataCurationTerm>) => testEntityManager.save(Object.assign(new MetadataCurationTerm(), {
  normalizedText: normalizeCurationText(term.text),
  ...term,
}))

// baseIms up-projects other slots (organism, organ, ...) to pending text too, so rows are read per slot
const rowsOf = (datasetId: string, slot = 'disease') => testEntityManager.find(MetadataCurationTerm, { datasetId, slot })
const countOf = (slot: string) => testEntityManager.count(MetadataCurationTerm, { slot })

const reprocess = (id: string, metadataV2: MetadataV2Envelope) =>
  doQuery(reprocessQuery, { id, input: createInput(metadataV2) }, { context: userContext })

const failure = (promise: Promise<unknown>) =>
  promise.then(() => { throw new Error('expected a rejection') }, err => JSON.parse(err.message))

describe('Dataset mutations: metadata curation', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    jest.clearAllMocks()
    mockSmApiDatasets.smApiDatasetRequest.mockResolvedValue({ status: 'ok' })
    mockSmApiDatasets.smApiUpdateDataset.mockResolvedValue({ status: 'ok' } as any)
    mockSmApiDatasets.smApiDeleteDataset.mockResolvedValue({ status: 'ok' } as any)
    clearOntologyTermSuggestionCache()
    await onBeforeEach()
    await setupTestUsers()
    await insertOntologyTerm('MONDO:1', 'Melanoma')
  })
  afterEach(onAfterEach)

  it('createDataset promotes an exact match before saving', async() => {
    await createDataset(envelopeWith({ disease: pending('melanoma') }))

    const doc = lastAddDoc()
    expect(doc.metadataV2.document.sample.disease).toEqual({
      value_ontology_id: 'MONDO:1',
      value_label: 'Melanoma',
      value_free_text: 'melanoma',
      curation_state: 'controlled',
    })
    expect(doc.metadata.Sample_Information.Condition).toBe('Melanoma')
    expect(await countOf('disease')).toBe(0)
  })

  it('reprocess through createDataset refuses text rejected on this dataset', async() => {
    const datasetId = await existingDataset(envelopeWith({ disease: pending('bad disease') }))
    await saveTerm({ slot: 'disease', datasetId, text: 'bad disease', status: 'rejected', note: 'not a disease' })

    const parsed = await failure(reprocess(datasetId, envelopeWith({ disease: pending('Bad disease') })))

    expect(parsed.type).toBe('failed_validation')
    expect(parsed.validation_errors[0]).toEqual({
      dataPath: '.metadataV2.document.sample.disease',
      message: '"Bad disease" was rejected by a curator: not a disease',
    })
    expect(mockSmApiDatasets.smApiDatasetRequest).not.toHaveBeenCalled()
    expect(await rowsOf(datasetId)).toMatchObject([{ status: 'rejected' }])
  })

  it('an admin with skipValidation saves over an own rejected row', async() => {
    const stored = envelopeWith({ disease: pending('asdf') })
    const datasetId = await existingDataset(stored)
    const row = await saveTerm({ slot: 'disease', datasetId, text: 'asdf', status: 'rejected', note: 'not a disease' })

    await doQuery(`mutation ($id: String!, $input: DatasetUpdateInput!) {
      updateDataset(id: $id, input: $input, skipValidation: true)
    }`, { id: datasetId, input: { metadataV2Json: JSON.stringify(stored) } }, { context: adminContext })

    const [, update] = mockSmApiDatasets.smApiUpdateDataset.mock.calls[0]
    expect(update.metadataV2.document.sample.disease).toEqual(pending('asdf'))
    expect(await rowsOf(datasetId)).toEqual([row])
  })

  it('createDataset ignores a rejection made on another dataset', async() => {
    const otherId = await existingDataset(null, adminUser.id)
    await saveTerm({ slot: 'disease', datasetId: otherId, text: 'bad disease', status: 'rejected', note: 'no' })

    const datasetId = await createDataset(envelopeWith({ disease: pending('Bad disease') }))

    expect(lastAddDoc().metadataV2.document.sample.disease).toEqual(pending('Bad disease'))
    expect(await rowsOf(datasetId)).toMatchObject([{ slot: 'disease', status: 'pending', submitterId: testUser.id }])
  })

  it('updateDataset with legacy-only input resolves the up-projected envelope', async() => {
    const datasetId = await existingDataset(null)
    const metadata = { ...baseIms, Sample_Information: { ...baseIms.Sample_Information, Condition: 'melanoma' } }

    await updateDataset(datasetId, { metadataJson: JSON.stringify(metadata) })

    const [id, update] = mockSmApiDatasets.smApiUpdateDataset.mock.calls[0]
    expect(id).toBe(datasetId)
    expect(update.metadataV2.document.sample.disease).toMatchObject({
      value_ontology_id: 'MONDO:1', curation_state: 'controlled',
    })
    expect(update.metadata).toEqual(metadata)
  })

  it('createDataset with unknown text writes the dataset\'s pending row', async() => {
    const datasetId = await createDataset(envelopeWith({ disease: pending('Disease 1') }))

    expect(await rowsOf(datasetId)).toMatchObject([{
      slot: 'disease',
      normalizedText: 'disease 1',
      text: 'Disease 1',
      status: 'pending',
      datasetId,
      submitterId: testUser.id,
    }])
    expect(lastAddDoc().metadataV2.document.sample.disease).toEqual(pending('Disease 1'))
  })

  it('updateDataset by an admin records the stored owner as submitter', async() => {
    const datasetId = await existingDataset(null)

    await doQuery(updateDatasetQuery, {
      id: datasetId,
      input: { metadataV2Json: JSON.stringify(envelopeWith({ disease: pending('Disease 1') })) },
    }, { context: adminContext })

    expect(await rowsOf(datasetId)).toMatchObject([{ datasetId, submitterId: testUser.id, status: 'pending' }])
  })

  it('updateDataset that picks a term removes the pending row', async() => {
    const datasetId = await existingDataset(null)
    await updateDataset(datasetId, { metadataV2Json: JSON.stringify(envelopeWith({ disease: pending('Disease 1') })) })
    await storeUpdatedEnvelope(datasetId)
    expect(await rowsOf(datasetId)).toMatchObject([{ datasetId, status: 'pending' }])

    await updateDataset(datasetId, { metadataV2Json: JSON.stringify(envelopeWith({ disease: MELANOMA })) })

    expect(await rowsOf(datasetId)).toEqual([])
  })

  it('updateDataset with new text replaces the row in place', async() => {
    const datasetId = await existingDataset(null)
    await updateDataset(datasetId, { metadataV2Json: JSON.stringify(envelopeWith({ disease: pending('Disease 1') })) })
    await storeUpdatedEnvelope(datasetId)
    const [before] = await rowsOf(datasetId)

    await updateDataset(datasetId, { metadataV2Json: JSON.stringify(envelopeWith({ disease: pending('Disease 2') })) })

    expect(await rowsOf(datasetId)).toMatchObject([{ id: before.id, normalizedText: 'disease 2', status: 'pending' }])
  })

  it('updateDataset re-submitting stored pending text with no row writes one', async() => {
    const datasetId = await existingDataset(envelopeWith({ disease: pending('Disease 1') }))

    await updateDataset(datasetId, { metadataV2Json: JSON.stringify(envelopeWith({ disease: pending('Disease 1') })) })

    expect(await rowsOf(datasetId)).toMatchObject([{ datasetId, normalizedText: 'disease 1', status: 'pending' }])
  })

  it('reprocess through createDataset keeps the same row', async() => {
    const datasetId = await existingDataset(envelopeWith({ disease: pending('Disease 1') }))
    const row = await saveTerm({ slot: 'disease', datasetId, text: 'Disease 1', submitterId: testUser.id })

    await reprocess(datasetId, envelopeWith({ disease: pending('Disease 1') }))

    const rows = await rowsOf(datasetId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(row)
  })

  it('an existing pending row of another dataset is not touched by a decision elsewhere', async() => {
    const stored = envelopeWith({ disease: pending('Disease 1') })
    const a = await existingDataset(stored)
    const b = await existingDataset(stored)
    await updateDataset(a, { metadataV2Json: JSON.stringify(stored) })
    await updateDataset(b, { metadataV2Json: JSON.stringify(envelopeWith({ disease: pending('disease 1') })) })
    expect(await countOf('disease')).toBe(2)
    const [rowA] = await rowsOf(a)
    await testEntityManager.update(MetadataCurationTerm, rowA.id,
      { status: 'approved', canonicalLabel: 'Disease 1', decidedAt: new Date() })
    mockSmApiDatasets.smApiUpdateDataset.mockClear()

    await updateDataset(b, { metadataV2Json: JSON.stringify(envelopeWith({ disease: pending('disease 1') })) })

    // B's own pending row (step 2) wins over A's approval (step 3): B stays pending until decided itself
    const [, update] = mockSmApiDatasets.smApiUpdateDataset.mock.calls[0]
    expect(update.metadataV2.document.sample.disease).toEqual(pending('disease 1'))
    expect(await rowsOf(b)).toMatchObject([{ datasetId: b, status: 'pending', decidedAt: null }])
    expect(await rowsOf(a)).toMatchObject([{ datasetId: a, status: 'approved' }])
  })

  it('a save resolved by another dataset\'s approved row writes nothing', async() => {
    const otherId = await existingDataset(null, adminUser.id)
    await saveTerm({
      slot: 'sample_stabilisation',
      datasetId: otherId,
      text: 'fresh frozen',
      status: 'approved',
      canonicalLabel: 'Fresh frozen',
      decidedAt: new Date(),
    })

    const datasetId = await createDataset(envelopeWith({ disease: MELANOMA, sample_stabilisation: pending('Fresh frozen') }))

    expect(lastAddDoc().metadataV2.document.sample.sample_stabilisation).toEqual({
      value_label: 'Fresh frozen', value_free_text: 'Fresh frozen', curation_state: 'free_text_accepted',
    })
    expect(await rowsOf(datasetId, 'sample_stabilisation')).toEqual([])
    expect(await countOf('sample_stabilisation')).toBe(1)
  })

  it('a save on a decided row of the dataset keeps the row', async() => {
    const stored = envelopeWith({ disease: MELANOMA, sample_stabilisation: pending('Fresh frozen') })
    const datasetId = await existingDataset(stored)
    const decided = await saveTerm({
      slot: 'sample_stabilisation',
      datasetId,
      text: 'fresh frozen',
      status: 'approved',
      canonicalLabel: 'Fresh frozen',
    })

    await updateDataset(datasetId, {
      metadataV2Json: JSON.stringify({
        ...stored,
        document: { ...stored.document, sample: { ...stored.document.sample, disease: pending('melanoma') } },
      }),
    })

    const [, update] = mockSmApiDatasets.smApiUpdateDataset.mock.calls[0]
    expect(update.metadataV2.document.sample.sample_stabilisation.curation_state).toBe('free_text_accepted')
    expect(await rowsOf(datasetId, 'sample_stabilisation')).toMatchObject([{ id: decided.id, status: 'approved' }])
  })

  it('a save that fails validation creates no queue row', async() => {
    const envelope = envelopeWith({ disease: pending('Disease 1') })
    // A polarity that resolves to nothing leaves the required legacy MS_Analysis.Polarity unset
    envelope.document.acquisition.polarity.user_value = { curation_state: 'pending_curation' }

    const parsed = await failure(createDataset(envelope))

    expect(parsed.type).toBe('failed_validation')
    expect(await testEntityManager.count(MetadataCurationTerm)).toBe(0)
    expect(mockSmApiDatasets.smApiDatasetRequest).not.toHaveBeenCalled()
  })

  it('deleteDataset removes the rows', async() => {
    const datasetId = await existingDataset(null)
    const otherId = await existingDataset(null, adminUser.id)
    await saveTerm({ slot: 'disease', datasetId, text: 'disease 1', status: 'pending' })
    await saveTerm({
      slot: 'sample_stabilisation',
      datasetId,
      text: 'fresh frozen',
      status: 'approved',
      canonicalLabel: 'Fresh frozen',
    })
    await saveTerm({ slot: 'disease', datasetId: otherId, text: 'disease 1', status: 'pending' })

    await doQuery(deleteDatasetQuery, { id: datasetId }, { context: userContext })

    expect(await testEntityManager.find(MetadataCurationTerm, { datasetId })).toEqual([])
    expect(await rowsOf(otherId)).toHaveLength(1)
  })
})
