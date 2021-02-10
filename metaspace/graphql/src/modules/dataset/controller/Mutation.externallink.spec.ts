jest.mock('../../../../esConnector')
import * as _mockEsConnector from '../../../../esConnector'

import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers, testEntityManager,
} from '../../../tests/graphqlTestEnvironment'
import { ExternalLink } from '../../project/ExternalLink'
import { createTestDataset } from '../../../tests/testDataCreation'
import { Dataset as DatasetModel } from '../model'

const mockEsConnector = _mockEsConnector as jest.Mocked<typeof _mockEsConnector>

describe('Dataset external links', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
  })
  afterEach(onAfterEach)

  interface ResultType {
    id: string;
    externalLinks: ExternalLink[] | null;
  }
  const addLink = async(datasetId: string, provider: string, link: string, replaceExisting: boolean) =>
    await doQuery<ResultType>(`
    mutation($datasetId: String!, $provider: String!, $link: String!, $replaceExisting: Boolean!) {
      addDatasetExternalLink(datasetId: $datasetId, provider: $provider, link: $link, replaceExisting: $replaceExisting) {
        id
        externalLinks { provider link }
      } 
    }`, { datasetId, provider, link, replaceExisting })
  const removeLink = async(datasetId: string, provider: string, link?: string) =>
    await doQuery<ResultType>(`
    mutation($datasetId: String!, $provider: String!, $link: String) {
      removeDatasetExternalLink(datasetId: $datasetId, provider: $provider, link: $link) {
        id
        externalLinks { provider link }
      } 
    }`, { datasetId, provider, link })
  const provider = 'MetaboLights'
  const provider4 = 'DOI'
  const link = 'https://www.ebi.ac.uk/metabolights/MTBLS313'
  const link2 = 'https://www.ebi.ac.uk/metabolights/MTBLS317'
  const link3 = 'https://www.ebi.ac.uk/metabolights/MTBLS378'
  const link4 = 'https://doi.org/10.1038/nmeth.4072'

  mockEsConnector.esDatasetByID.mockImplementation(async(id) => Promise.resolve({ id, _source: { ds_id: id } }))

  it('Should add be able to add links', async() => {
    const dataset = await createTestDataset()

    const result1 = await addLink(dataset.id, provider, link, false)
    await addLink(dataset.id, provider, link, false) // Duplication should do nothing
    const result2 = await addLink(dataset.id, provider, link2, false)

    const updatedDataset = await testEntityManager.findOneOrFail(DatasetModel, dataset.id)
    expect(updatedDataset.externalLinks).toEqual([{ provider, link }, { provider, link: link2 }])
    expect(result1.id).toEqual(dataset.id)
    expect(result1.externalLinks).toEqual([{ provider, link }])
    expect(result2.externalLinks).toEqual(updatedDataset.externalLinks)
  })

  it('Should add be able to overwrite existing links', async() => {
    const dataset = await createTestDataset()
    await addLink(dataset.id, provider, link, false)
    await addLink(dataset.id, provider, link2, false)
    await addLink(dataset.id, provider4, link4, false)

    const result = await addLink(dataset.id, provider, link3, true)

    const updatedDataset = await testEntityManager.findOneOrFail(DatasetModel, dataset.id)
    expect(result.id).toEqual(dataset.id)
    expect(result.externalLinks).toEqual([
      { provider: provider4, link: link4 },
      { provider, link: link3 },
    ])
    expect(updatedDataset.externalLinks).toEqual(result.externalLinks)
  })

  it('Should add be able to remove specific links', async() => {
    const dataset = await createTestDataset()
    await addLink(dataset.id, provider, link, false)
    await addLink(dataset.id, provider, link2, false)
    await addLink(dataset.id, provider4, link4, false)

    const result = await removeLink(dataset.id, provider, link2)

    const updatedDataset = await testEntityManager.findOneOrFail(DatasetModel, dataset.id)
    expect(updatedDataset.externalLinks).toEqual([
      { provider, link },
      { provider: provider4, link: link4 },
    ])
    expect(result.id).toEqual(dataset.id)
    expect(result.externalLinks).toEqual(updatedDataset.externalLinks)
  })

  it('Should add be able to remove all links from a provider', async() => {
    const dataset = await createTestDataset()
    await addLink(dataset.id, provider, link, false)
    await addLink(dataset.id, provider, link2, false)
    await addLink(dataset.id, provider4, link4, false)

    const result = await removeLink(dataset.id, provider)

    const updatedDataset = await testEntityManager.findOneOrFail(DatasetModel, dataset.id)
    expect(updatedDataset.externalLinks).toEqual([{ provider: provider4, link: link4 }])
    expect(result.id).toEqual(dataset.id)
    expect(result.externalLinks).toEqual(updatedDataset.externalLinks)
  })
})
