import * as _smApiDatasets from '../../utils/smApi/datasets'
import logger from '../../utils/logger'
import {
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  testEntityManager,
} from '../../tests/graphqlTestEnvironment'
import { createTestDatasetWithEngineDataset, createTestUser } from '../../tests/testDataCreation'
import { LegacyMetadata, MetadataV2Envelope, OntologyTermValue, upProjectToV2 } from '../dataset/projection'
import { MetadataCurationTerm } from './model'
import { applyCurationTerm } from './apply'

jest.mock('../../utils/smApi/datasets')
const mockSmApiDatasets = _smApiDatasets as jest.Mocked<typeof _smApiDatasets>

const baseIms: LegacyMetadata = {
  Data_Type: 'Imaging MS',
  Sample_Information: {
    Organism: 'Mus musculus',
    Organism_Part: 'liver',
    Condition: 'disease 1',
    Sample_Growth_Conditions: 'keep me',
  },
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

const pendingDisease: OntologyTermValue = { value_free_text: 'disease 1', curation_state: 'pending_curation' }
const acceptedDisease: OntologyTermValue = {
  value_label: 'Disease One',
  value_free_text: 'disease 1',
  curation_state: 'free_text_accepted',
}

const envelopeWithDisease = (disease: OntologyTermValue): MetadataV2Envelope => {
  const envelope = upProjectToV2(baseIms)
  envelope.document.sample.disease = disease
  return envelope
}

describe('applyCurationTerm', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  let userId: string

  beforeEach(async() => {
    await onBeforeEach()
    userId = (await createTestUser()).id
    mockSmApiDatasets.smApiDatasetRequest.mockReset()
    mockSmApiDatasets.smApiDatasetRequest.mockResolvedValue({ status: 'ok' })
  })
  afterEach(onAfterEach)

  const createDataset = async(disease: OntologyTermValue, metadata: any = baseIms) => {
    const { engineDataset } = await createTestDatasetWithEngineDataset({ userId },
      { metadata, metadataV2: envelopeWithDisease(disease) })
    return engineDataset.id
  }

  const createTerm = async(fields: Partial<MetadataCurationTerm>, datasetId: string) =>
    await testEntityManager.save(MetadataCurationTerm, {
      slot: 'disease',
      normalizedText: 'disease 1',
      text: 'disease 1',
      datasetId,
      ...fields,
    }) as MetadataCurationTerm

  const approved = { status: 'approved' as const, canonicalLabel: 'Disease One' }
  const reload = (id: string) => testEntityManager.findOneOrFail(MetadataCurationTerm, id)
  const calls = () => mockSmApiDatasets.smApiDatasetRequest.mock.calls
  const sentDocs = () => calls().map(([, args]) => args.doc)

  it("rewrites the row's dataset and patches only the slot's legacy key", async() => {
    const dsId = await createDataset(pendingDisease)
    await createDataset(pendingDisease)
    const term = await createTerm(approved, dsId)

    await applyCurationTerm(testEntityManager, term.id)

    expect(calls()).toHaveLength(1)
    const [uri, args] = calls()[0]
    expect(uri).toEqual(`/v1/datasets/${dsId}/update`)
    expect(args.async_es_update).toBe(true)
    expect(args.doc.metadataV2.document.sample.disease).toEqual(acceptedDisease)
    expect(args.doc.metadata).toEqual({
      ...baseIms,
      Sample_Information: { ...baseIms.Sample_Information, Condition: 'Disease One' },
    })
    const after = await reload(term.id)
    expect(after.applyState).toEqual('done')
    expect(after.appliedCount).toEqual(1)
  })

  it('skips the dataset when its value no longer carries the text', async() => {
    const dsId = await createDataset({ value_ontology_id: 'MONDO:1', value_label: 'Other', curation_state: 'controlled' })
    const term = await createTerm(approved, dsId)

    await applyCurationTerm(testEntityManager, term.id)

    expect(calls()).toHaveLength(0)
    const after = await reload(term.id)
    expect(after.appliedCount).toEqual(0)
    expect(after.applyState).toEqual('done')
  })

  it('does nothing for a missing row', async() => {
    await applyCurationTerm(testEntityManager, '00000000-0000-0000-0000-000000000000')

    expect(calls()).toHaveLength(0)
  })

  it('re-decision rewrites a value already resolved from this text', async() => {
    const dsId = await createDataset({
      value_ontology_id: 'MONDO:1',
      value_label: 'Mapped Disease',
      value_free_text: 'disease 1',
      curation_state: 'controlled',
    }, { ...baseIms, Sample_Information: { ...baseIms.Sample_Information, Condition: 'Mapped Disease' } })
    const term = await createTerm(approved, dsId)

    await applyCurationTerm(testEntityManager, term.id)

    expect(sentDocs()[0].metadataV2.document.sample.disease).toEqual(acceptedDisease)
    expect(sentDocs()[0].metadata.Sample_Information.Condition).toEqual('Disease One')
  })

  it('rewrites a reconciled acquisition slot through user_value', async() => {
    const { engineDataset } = await createTestDatasetWithEngineDataset({ userId },
      { metadata: baseIms, metadataV2: upProjectToV2(baseIms) })
    const term = await createTerm({
      slot: 'ionization_source', text: 'MALDI', normalizedText: 'maldi', status: 'approved', canonicalLabel: 'MALDI-2',
    }, engineDataset.id)

    await applyCurationTerm(testEntityManager, term.id)

    expect(calls()).toHaveLength(1)
    const [doc] = sentDocs()
    expect(doc.metadataV2.document.acquisition.ionization_source).toEqual({
      user_value: { value_label: 'MALDI-2', value_free_text: 'MALDI', curation_state: 'free_text_accepted' },
      reconciliation_state: 'not_checked',
    })
    expect(doc.metadata).toEqual({ ...baseIms, MS_Analysis: { ...baseIms.MS_Analysis, Ionisation_Source: 'MALDI-2' } })
    expect((await reload(term.id)).appliedCount).toEqual(1)
  })

  it('leaves a row reset to pending while the apply runs untouched', async() => {
    const term = await createTerm(approved, await createDataset(pendingDisease))
    let resolveUpdate!: (value: any) => void
    let updateStarted!: () => void
    const started = new Promise<void>(resolve => { updateStarted = resolve })
    mockSmApiDatasets.smApiDatasetRequest.mockImplementationOnce(() => new Promise(resolve => {
      resolveUpdate = resolve
      updateStarted()
    }))

    const applying = applyCurationTerm(testEntityManager, term.id)
    await started
    // the owner re-saves new text meanwhile: upsertPendingRow resets the row
    await testEntityManager.update(MetadataCurationTerm, term.id,
      { status: 'pending', applyState: 'idle', appliedCount: 0 })
    resolveUpdate({ status: 'ok' })
    await applying

    expect(calls()).toHaveLength(1)
    expect(await reload(term.id)).toMatchObject({ status: 'pending', applyState: 'idle', appliedCount: 0 })
  })

  describe('with a failing update', () => {
    let errorSpy: jest.SpyInstance

    beforeEach(() => {
      errorSpy = jest.spyOn(logger, 'error')
      errorSpy.mockImplementation(() => logger)
    })
    afterEach(() => {
      errorSpy.mockRestore()
    })

    const setupFailure = async() => {
      const term = await createTerm(approved, await createDataset(pendingDisease))
      mockSmApiDatasets.smApiDatasetRequest.mockRejectedValueOnce(new Error('dataset_busy'))
      await applyCurationTerm(testEntityManager, term.id)
      return term
    }

    it('ends failed with nothing applied', async() => {
      const term = await setupFailure()

      expect(calls()).toHaveLength(1)
      expect(errorSpy).toHaveBeenCalled()
      const after = await reload(term.id)
      expect(after.appliedCount).toEqual(0)
      expect(after.applyState).toEqual('failed')
    })

    it('retry rewrites the dataset to the same document', async() => {
      const term = await setupFailure()

      await applyCurationTerm(testEntityManager, term.id)

      expect(calls()).toHaveLength(2)
      expect(sentDocs()[1]).toEqual(sentDocs()[0])
      const after = await reload(term.id)
      expect(after.applyState).toEqual('done')
      expect(after.appliedCount).toEqual(1)
    })

    it('a failure outside the update still ends failed and does not reject', async() => {
      const term = await createTerm(approved, await createDataset(pendingDisease))
      const findOne = jest.spyOn(testEntityManager, 'findOne')
      findOne.mockImplementationOnce(() => Promise.resolve(term))
      findOne.mockImplementationOnce(() => Promise.reject(new Error('db down')))

      await expect(applyCurationTerm(testEntityManager, term.id)).resolves.toBeUndefined()

      findOne.mockRestore()
      expect(calls()).toHaveLength(0)
      expect((await reload(term.id)).applyState).toEqual('failed')
    })
  })

  it('rejected term reverts to pending', async() => {
    const dsId = await createDataset(acceptedDisease,
      { ...baseIms, Sample_Information: { ...baseIms.Sample_Information, Condition: 'Disease One' } })
    const term = await createTerm({ status: 'rejected' }, dsId)

    await applyCurationTerm(testEntityManager, term.id)

    expect(sentDocs()[0].metadataV2.document.sample.disease).toEqual(pendingDisease)
    expect(sentDocs()[0].metadata.Sample_Information.Condition).toEqual('disease 1')
    expect((await reload(term.id)).applyState).toEqual('done')
  })
})
