jest.mock('../../../../esConnector')
import * as _mockEsConnector from '../../../../esConnector'

import {
  anonContext,
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testEntityManager,
  testUser,
} from '../../../tests/graphqlTestEnvironment'
import { createTestDataset, createTestUser } from '../../../tests/testDataCreation'
import { getContextForTest } from '../../../getContext'
import { Roi } from '../../engine/model'

const mockEsConnector = _mockEsConnector as jest.Mocked<typeof _mockEsConnector>

const GRID = { count_x: 100, count_y: 100 }

const triangle = (name: string) => ({
  type: 'Feature',
  properties: { name },
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 5], [5, 5]]] },
})

const importRoisQuery = `mutation($datasetId: String!, $geojson: String!) {
    importRois(datasetId: $datasetId, geojson: $geojson) { id name isDefault userId }
  }`

describe('Dataset mutations: importRois', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
  })
  afterEach(async() => {
    await onAfterEach()
    jest.clearAllMocks()
  })

  const mockEsDataset = (submitterId: string) => {
    mockEsConnector.esDatasetByID.mockImplementation(async(id) => Promise.resolve({
      _source: { ds_id: id, ds_submitter_id: submitterId, ds_acq_geometry: { acquisition_grid: GRID } },
    } as any))
  }

  const saveRoi = (datasetId: string, userId: string, name: string, isDefault: boolean) =>
    testEntityManager.save(Roi, { datasetId, userId, name, isDefault, geojson: triangle(name) })

  const listRois = (datasetId: string) =>
    testEntityManager.find(Roi, { where: { datasetId }, order: { id: 'ASC' } })

  it('rejects unauthenticated requests', async() => {
    const dataset = await createTestDataset()
    mockEsDataset(testUser.id)
    await expect(
      doQuery(importRoisQuery, { datasetId: dataset.id, geojson: JSON.stringify(triangle('x')) }, { context: anonContext })
    ).rejects.toThrowError(/Not authenticated/)
  })

  it('rejects an invalid payload without saving anything', async() => {
    const dataset = await createTestDataset()
    mockEsDataset(testUser.id)
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [triangle('ok'), { ...triangle('bad'), properties: { name: { a: 1 } } }],
    })
    await expect(doQuery(importRoisQuery, { datasetId: dataset.id, geojson })).rejects
      .toThrowError(/"name" must be a non-empty string/)
    expect(await listRois(dataset.id)).toHaveLength(0)
  })

  it('saves default ROIs when the user can edit the dataset', async() => {
    const dataset = await createTestDataset()
    mockEsDataset(testUser.id)
    await saveRoi(dataset.id, testUser.id, 'Existing', true)

    const result = await doQuery(importRoisQuery, {
      datasetId: dataset.id,
      geojson: JSON.stringify({ type: 'FeatureCollection', features: [triangle('A'), triangle('B')] }),
    })

    expect(result.map((r: any) => [r.name, r.isDefault])).toEqual([['A', true], ['B', true]])
    const all = await listRois(dataset.id)
    expect(all.map(r => [r.name, r.isDefault, r.userId])).toEqual([
      ['Existing', true, testUser.id],
      ['A', true, testUser.id],
      ['B', true, testUser.id],
    ])
  })

  it('does not take the group or the include flag from the file', async() => {
    const dataset = await createTestDataset()
    mockEsDataset(testUser.id)
    const feature = { ...triangle('A'), properties: { name: 'A', group: 'Tumor', includeInDiff: false } }

    await doQuery(importRoisQuery, { datasetId: dataset.id, geojson: JSON.stringify(feature) })

    const all = await listRois(dataset.id)
    expect(all.map(r => [r.name, r.groupLabel, r.includeInDiff])).toEqual([['A', null, true]])
  })

  describe('as a non-editor', () => {
    it('copies the dataset defaults into the user\'s own set before appending, so nothing disappears', async() => {
      const owner = await createTestUser()
      const dataset = await createTestDataset({ userId: owner.id })
      mockEsDataset(owner.id)
      await saveRoi(dataset.id, owner.id, 'Default 1', true)
      await saveRoi(dataset.id, owner.id, 'Default 2', true)
      const ctx = getContextForTest({ ...testUser } as any, testEntityManager)

      const result = await doQuery(importRoisQuery, {
        datasetId: dataset.id,
        geojson: JSON.stringify(triangle('Mine')),
      }, { context: ctx })

      // Only the imported ROI is returned...
      expect(result.map((r: any) => [r.name, r.isDefault, r.userId])).toEqual([['Mine', false, testUser.id]])
      // ...but the user now owns private copies of the defaults as well, and the defaults are untouched
      const all = await listRois(dataset.id)
      expect(all.map(r => [r.name, r.isDefault, r.userId])).toEqual([
        ['Default 1', true, owner.id],
        ['Default 2', true, owner.id],
        ['Default 1', false, testUser.id],
        ['Default 2', false, testUser.id],
        ['Mine', false, testUser.id],
      ])
    })

    it('keeps the group labels of the copied defaults', async() => {
      const owner = await createTestUser()
      const dataset = await createTestDataset({ userId: owner.id })
      mockEsDataset(owner.id)
      await testEntityManager.save(Roi, {
        datasetId: dataset.id, userId: owner.id, name: 'Default', isDefault: true, geojson: triangle('Default'), groupLabel: 'Tumor', includeInDiff: false,
      })
      const ctx = getContextForTest({ ...testUser } as any, testEntityManager)

      await doQuery(importRoisQuery, { datasetId: dataset.id, geojson: JSON.stringify(triangle('Mine')) }, { context: ctx })

      const mine = await testEntityManager.find(Roi, { where: { datasetId: dataset.id, userId: testUser.id }, order: { id: 'ASC' } })
      expect(mine.map(r => [r.name, r.groupLabel, r.includeInDiff])).toEqual([['Default', 'Tumor', false], ['Mine', null, true]])
    })

    it('does not copy defaults again when the user already has their own ROIs', async() => {
      const owner = await createTestUser()
      const dataset = await createTestDataset({ userId: owner.id })
      mockEsDataset(owner.id)
      await saveRoi(dataset.id, owner.id, 'Default', true)
      await saveRoi(dataset.id, testUser.id, 'Already mine', false)
      const ctx = getContextForTest({ ...testUser } as any, testEntityManager)

      await doQuery(importRoisQuery, { datasetId: dataset.id, geojson: JSON.stringify(triangle('New')) }, { context: ctx })

      const all = await listRois(dataset.id)
      expect(all.map(r => [r.name, r.isDefault, r.userId])).toEqual([
        ['Default', true, owner.id],
        ['Already mine', false, testUser.id],
        ['New', false, testUser.id],
      ])
    })
  })
})

describe('Dataset mutations: ROI group label', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    mockEsConnector.esDatasetByID.mockImplementation(async(id) =>
      Promise.resolve({ _source: { ds_id: id, ds_submitter_id: testUser.id } } as any))
  })
  afterEach(async() => {
    await onAfterEach()
    jest.clearAllMocks()
  })

  const createRoiQuery = `mutation($datasetId: String!, $input: RoiInput!) {
      createRoi(datasetId: $datasetId, input: $input) { id groupLabel }
    }`
  const updateRoiQuery = `mutation($id: ID!, $input: RoiInput!) {
      updateRoi(id: $id, input: $input) { id groupLabel }
    }`
  const input = (groupLabel: string | null) => ({ name: 'A', geojson: JSON.stringify(triangle('A')), groupLabel })

  it('trims the label and accepts 64 characters', async() => {
    const dataset = await createTestDataset()
    const label = 'x'.repeat(64)

    const created = await doQuery(createRoiQuery, { datasetId: dataset.id, input: input(`  ${label} `) })
    expect(created.groupLabel).toBe(label)
    const updated = await doQuery(updateRoiQuery, { id: created.id, input: input('  Tumor ') })
    expect(updated.groupLabel).toBe('Tumor')
    expect((await doQuery(updateRoiQuery, { id: created.id, input: input('   ') })).groupLabel).toBeNull()
  })

  it('rejects a label longer than 64 characters on create and on update', async() => {
    const dataset = await createTestDataset()
    const tooLong = 'x'.repeat(65)

    await expect(doQuery(createRoiQuery, { datasetId: dataset.id, input: input(tooLong) })).rejects
      .toThrowError(/group name is longer than 64 characters/)
    expect(await testEntityManager.count(Roi, { where: { datasetId: dataset.id } })).toBe(0)

    const created = await doQuery(createRoiQuery, { datasetId: dataset.id, input: input('Tumor') })
    await expect(doQuery(updateRoiQuery, { id: created.id, input: input(tooLong) })).rejects
      .toThrowError(/group name is longer than 64 characters/)
    expect((await testEntityManager.findOneOrFail(Roi, created.id)).groupLabel).toBe('Tumor')
  })
})
