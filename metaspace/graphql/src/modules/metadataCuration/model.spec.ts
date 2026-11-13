import {
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  testEntityManager,
} from '../../tests/graphqlTestEnvironment'
import { createTestDataset, createTestUser } from '../../tests/testDataCreation'
import { Dataset } from '../dataset/model'
import { IsNull } from 'typeorm'
import { MetadataCurationTerm } from './model'

describe('MetadataCurationTerm', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(onBeforeEach)
  afterEach(onAfterEach)

  const createTerm = async(slot: string, datasetId: string, normalizedText: string,
    extra: Partial<MetadataCurationTerm> = {}) =>
    await testEntityManager.save(Object.assign(new MetadataCurationTerm(),
      { slot, datasetId, normalizedText, text: normalizedText, ...extra }))

  const newDataset = async() => await createTestDataset({ userId: (await createTestUser()).id })

  it('saves a pending row with defaults', async() => {
    const user = await createTestUser()
    const dataset = await newDataset()
    const saved = await createTerm('disease', dataset.id, 'disease 1', { text: 'Disease 1', submitterId: user.id })
    const term = await testEntityManager.findOneOrFail(MetadataCurationTerm, saved.id)

    expect(term.status).toEqual('pending')
    expect(term.aliases).toEqual([])
    expect(term.applyState).toEqual('idle')
    expect(term.appliedCount).toEqual(0)
    expect(term.datasetId).toEqual(dataset.id)
    expect(term.submitterId).toEqual(user.id)
    expect(term.createdAt).toBeInstanceOf(Date)
  })

  it('allows a decided row beside the pending row of the same slot and dataset', async() => {
    const dataset = await newDataset()
    await createTerm('disease', dataset.id, 'disease 1', { status: 'approved' })
    await createTerm('disease', dataset.id, 'disease 2', { status: 'mapped' })
    await createTerm('disease', dataset.id, 'disease 3')

    expect(await testEntityManager.count(MetadataCurationTerm, { slot: 'disease', datasetId: dataset.id })).toEqual(3)
  })

  it('rejects a second pending row for the same slot and dataset', async() => {
    const dataset = await newDataset()
    await createTerm('disease', dataset.id, 'disease 1')
    // TypeORM logs the failed INSERT through console.log; the failure is the expected outcome here.
    const log = console.log
    console.log = jest.fn()
    try {
      await expect(createTerm('disease', dataset.id, 'disease 2')).rejects.toThrow(/duplicate key/)
    } finally {
      console.log = log
    }
  })

  it('allows the same text on two datasets', async() => {
    const d1 = await newDataset()
    const d2 = await newDataset()
    await createTerm('disease', d1.id, 'disease 1')
    await createTerm('disease', d2.id, 'disease 1')

    expect(await testEntityManager.count(MetadataCurationTerm, { slot: 'disease', normalizedText: 'disease 1' }))
      .toEqual(2)
  })

  it('deleting the dataset keeps the row and clears its dataset', async() => {
    const dataset = await newDataset()
    const term = await createTerm('disease', dataset.id, 'disease 1', { status: 'approved' })

    await testEntityManager.delete(Dataset, dataset.id)

    expect((await testEntityManager.findOneOrFail(MetadataCurationTerm, term.id)).datasetId).toBeNull()
  })

  it('allows several dataset-less rows of the same slot', async() => {
    const d1 = await newDataset()
    const d2 = await newDataset()
    await createTerm('disease', d1.id, 'disease 1', { status: 'approved' })
    await createTerm('disease', d2.id, 'disease 2', { status: 'approved' })

    await testEntityManager.delete(Dataset, d1.id)
    await testEntityManager.delete(Dataset, d2.id)

    expect(await testEntityManager.count(MetadataCurationTerm, { slot: 'disease', datasetId: IsNull() })).toEqual(2)
  })
})
