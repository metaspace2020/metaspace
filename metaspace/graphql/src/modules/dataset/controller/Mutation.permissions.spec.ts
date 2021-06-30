import {
  createTestDataset,
  createTestDatasetProject,
  createTestDatasetWithEngineDataset,
  getTestUserForScenario,
  TestUserScenario,
  TestUserScenarioOptions,
} from '../../../tests/testDataCreation'
import {
  doQuery, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach,
  setupTestUsers, testEntityManager,
  testUser,
} from '../../../tests/graphqlTestEnvironment'
import { Group } from '../../group/model'
import { Dataset } from '../model'

import * as _smApiDatasets from '../../../utils/smApi/datasets'
import { DatasetUpdateInput } from '../../../binding'
import { EngineDataset } from '../../engine/model'
import _ = require('lodash')
jest.mock('../../../utils/smApi/datasets')
const mockSmApiDatasets = _smApiDatasets as jest.Mocked<typeof _smApiDatasets>
mockSmApiDatasets.smApiDatasetRequest.mockReturnValue('{"status": "ok"}')
mockSmApiDatasets.smApiDeleteDataset.mockReturnValue('{"status": "ok"}')
mockSmApiDatasets.smApiUpdateDataset.mockReturnValue('{"status": "ok"}')

describe('Dataset mutations: editing permissions', () => {
  let dataset: Dataset
  let group: Group
  const databaseIds: number[] = []

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()

    await setupTestUsers()
  })
  afterEach(onAfterEach)

  const allScenarioTestCases = <T>(
    defaultVal: T, overrides: Partial<Record<TestUserScenario, T>>
  ): ([TestUserScenario, T])[] =>
      (Object.keys(TestUserScenarioOptions) as TestUserScenario[])
        .map(option => ([option, option in overrides ? overrides[option]! : defaultVal]))

  const updateDatasetQuery = `mutation($datasetId: String!, $input: DatasetUpdateInput!) {
    updateDataset(id: $datasetId, input: $input)
  }`
  const canEditMetadataCases = allScenarioTestCases(false, {
    currentUser: true,
    admin: true,
    sameGroupMember: true,
    sameGroupAdmin: true,
  })
  test.each(canEditMetadataCases)('Can edit dataset metadata: %s -> %s', async(scenario, canEdit) => {
    const { context, groupId, projectId } = await getTestUserForScenario(scenario)
    const { dataset, engineDataset } = await createTestDatasetWithEngineDataset(
      { userId: testUser.id, groupId }, { name: 'original name' }
    )
    const oldMetadata = engineDataset.metadata
    const updatedMetadata = _.defaultsDeep({}, { Sample_Information: { Organism: 'new organism' } }, oldMetadata)
    if (projectId != null) {
      await createTestDatasetProject(projectId, dataset.id)
    }
    const newDescription = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'new description' }] }],
    })
    const input: DatasetUpdateInput = {
      description: newDescription,
      name: 'new dataset name',
      metadataJson: JSON.stringify(updatedMetadata),
    }

    const promiseResult = doQuery(updateDatasetQuery, { datasetId: dataset.id, input }, { context })

    if (canEdit) {
      await expect(promiseResult).resolves.toBeTruthy()
      const updatedDataset = await testEntityManager.findOneOrFail(Dataset, dataset.id)
      // Description is updated directly
      expect(updatedDataset.description).toBe(newDescription)
      // EngineDataset fields are handled by sm-api, so won't be changed because it's mocked out for tests
      expect(mockSmApiDatasets.smApiUpdateDataset).toHaveBeenCalledWith(
        dataset.id,
        expect.objectContaining({
          name: 'new dataset name',
          metadata: updatedMetadata,
        }),
        expect.anything()
      )
    } else {
      await expect(promiseResult).rejects.toBeInstanceOf(Error)
      const updatedDataset = await testEntityManager.findOneOrFail(Dataset, dataset.id)
      expect(updatedDataset.description).toBe(dataset.description)
      expect(mockSmApiDatasets.smApiDatasetRequest).not.toHaveBeenCalled()
      expect(mockSmApiDatasets.smApiUpdateDataset).not.toHaveBeenCalled()
    }
  })

  const deleteDatasetQuery = `mutation($datasetId: String!) {
    deleteDataset(id: $datasetId)
  }`
  const canDeleteDatasetCases = allScenarioTestCases(false, {
    currentUser: true,
    admin: true,
    sameGroupAdmin: true,
  })
  test.each(canDeleteDatasetCases)('Can delete dataset: %s -> %s', async(scenario, canDelete) => {
    const { context, groupId, projectId } = await getTestUserForScenario(scenario)
    const dataset = await createTestDataset({ userId: testUser.id, groupId })
    if (projectId != null) {
      await createTestDatasetProject(projectId, dataset.id)
    }

    const deletePromise = doQuery(deleteDatasetQuery, { datasetId: dataset.id }, { context })

    if (canDelete) {
      await expect(deletePromise).resolves.toBeTruthy()
      expect(await testEntityManager.findOne(Dataset, dataset.id)).toBeUndefined()
      expect(mockSmApiDatasets.smApiDeleteDataset).toHaveBeenCalledWith(dataset.id, expect.anything())
    } else {
      await expect(deletePromise).rejects.toBeInstanceOf(Error)
      expect(await testEntityManager.findOne(Dataset, dataset.id)).toBeDefined()
      expect(mockSmApiDatasets.smApiDeleteDataset).not.toHaveBeenCalled()
    }
  })
})
