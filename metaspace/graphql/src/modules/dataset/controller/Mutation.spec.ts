/* eslint-disable quote-props */
import * as _ from 'lodash'

import { processingSettingsChanged } from './Mutation'
import { EngineDataset } from '../../engine/model'
import {
  createTestDataset,
  createTestGroup,
  createTestMolecularDB,
  createTestUserGroup,
} from '../../../tests/testDataCreation'
import {
  adminContext,
  doQuery, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach,
  setupTestUsers, testEntityManager,
  testUser,
  userContext,
} from '../../../tests/graphqlTestEnvironment'
import { Group, UserGroupRoleOptions as UGRO } from '../../group/model'
import { Dataset } from '../model'
import { getContextForTest } from '../../../getContext'

import * as _smApiDatasets from '../../../utils/smApi/datasets'
jest.mock('../../../utils/smApi/datasets')
const mockSmApiDatasets = _smApiDatasets as jest.Mocked<typeof _smApiDatasets>
mockSmApiDatasets.smApiDatasetRequest.mockReturnValue('{"status": "ok"}')

const sampleMetadata = {
  'Data_Type': 'Imaging MS',
  'MS_Analysis': {
    'Analyzer': 'FTICR',
    'Polarity': 'Positive',
    'Ionisation_Source': 'MALDI',
    'Detector_Resolving_Power': {
      'mz': 400,
      'Resolving_Power': 140000,
    },
    'Pixel_Size': { 'Xaxis': 50, 'Yaxis': 50 },
  },
  'Submitted_By': {
    'Submitter': {
      'Email': 'user@example.com',
      'Surname': 'Surname',
      'First_Name': 'Name',
    },
    'Institution': 'Genentech',
    'Principal_Investigator': {
      'Email': 'pi@example.com',
      'Surname': 'Surname',
      'First_Name': 'Name',
    },
  },
  'Sample_Information': {
    'Organism': 'Mus musculus (mouse)',
    'Condition': 'Dosed vs. vehicle',
    'Organism_Part': 'EMT6 Tumors',
    'Sample_Growth_Conditions': 'NA',
  },
  'Sample_Preparation': {
    'MALDI_Matrix': '2,5-dihydroxybenzoic acid (DHB)',
    'Tissue_Modification': 'N/A',
    'Sample_Stabilisation': 'Fresh frozen',
    'MALDI_Matrix_Application': 'TM sprayer',
  },
  'Additional_Information': {
    'Publication_DOI': 'NA',
    'Expected_Molecules_Freetext': 'tryptophan pathway',
    'Sample_Preparation_Freetext': 'NA',
    'Additional_Information_Freetext': 'NA',
  },
}

describe('Dataset mutations: processingSettingsChanged', () => {
  const dsConfig = {
    'image_generation': {
      'q': 99,
      'do_preprocessing': false,
      'nlevels': 30,
      'ppm': 3,
    },
    'isotope_generation': {
      'adducts': ['+H', '+Na', '+K'],
      'charge': {
        'polarity': '+',
        'n_charges': 1,
      },
      'isocalc_sigma': 0.000619,
      'isocalc_pts_per_mz': 8078,
    },
    'databases': [0],
  }
  const ds = {
    config: dsConfig,
    metadata: sampleMetadata,
  } as EngineDataset

  it('Reprocessing needed when database list changed', () => {
    const update = {
      databaseIds: [...ds.config.databases, 1],
      metadata: ds.metadata,
      updateEnrichment: false,
    }

    const { newDB } = processingSettingsChanged(ds, update)

    expect(newDB).toBe(true)
  })

  it('Drop reprocessing needed when instrument settings changed', () => {
    const update = {
      molDBs: ds.config.databases,
      metadata: _.defaultsDeep({ MS_Analysis: { Detector_Resolving_Power: { mz: 100 } } }, ds.metadata),
      updateEnrichment: false,
    }

    const { procSettingsUpd } = processingSettingsChanged(ds, update)

    expect(procSettingsUpd).toBe(true)
  })

  it('Reprocessing not needed when just metadata changed', () => {
    const update = {
      metadata: _.defaultsDeep({
        Sample_Preparation: { MALDI_Matrix: 'New matrix' },
        MS_Analysis: { ionisationSource: 'DESI' },
        Sample_Information: { Organism: 'New organism' },
      }, ds.metadata),
      updateEnrichment: false,
      name: 'New DS name',
    }

    const { newDB, procSettingsUpd } = processingSettingsChanged(ds, update)

    expect(newDB).toBe(false)
    expect(procSettingsUpd).toBe(false)
  })
})

describe('Dataset mutations: molecular databases permissions', () => {
  let dataset: Dataset
  let group: Group
  const databaseIds: number[] = []

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()

    await setupTestUsers()
    dataset = await createTestDataset()
    group = await createTestGroup()
    const databaseDocs = [
      { name: 'HMDB-v4', isPublic: true, groupId: null },
      { name: 'custom-db-pub', isPublic: true, groupId: group.id },
      { name: 'custom-db', isPublic: false, groupId: group.id },
    ]
    for (const dbDoc of databaseDocs) {
      databaseIds.push((await createTestMolecularDB(dbDoc)).id)
    }
  })
  afterEach(onAfterEach)

  const createDatasetQuery = `mutation createDataset($databaseIds: [Int!]) {
      createDataset(
        input: {
          name: "ds-name"
          inputPath: "input-path"
          databaseIds: $databaseIds
          metadataJson: ${JSON.stringify(JSON.stringify(sampleMetadata))}
          adducts: ["+H"]
          isPublic: true
          submitterId: ""
        }
      )
    }`
  const updateDatasetQuery = `mutation updateDataset($datasetId: String!, $databaseIds: [Int!]) {
      updateDataset(
        id: $datasetId,
        input: {
          databaseIds: $databaseIds
        },
        reprocess: true
      )
    }`

  test('User allowed to use Metaspace public and group databases', async() => {
    await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)

    const context = getContextForTest({ ...testUser, groupIds: [group.id] } as any, testEntityManager)
    await doQuery(createDatasetQuery, { databaseIds }, { context })
    await doQuery(updateDatasetQuery, { datasetId: dataset.id, databaseIds }, { context })
  })

  test('Non-group user not allowed to use group databases', async() => {
    const createPromise = doQuery(createDatasetQuery, { databaseIds }, { context: userContext })
    const updatePromise = doQuery(
      updateDatasetQuery, { datasetId: dataset.id, databaseIds }, { context: userContext }
    )

    await expect(createPromise).rejects.toThrowError(/Unauthorized/)
    await expect(updatePromise).rejects.toThrowError(/Unauthorized/)
  })

  test('Admin allowed to use Metaspace public and group databases', async() => {
    await doQuery(createDatasetQuery, { databaseIds }, { context: adminContext })
    await doQuery(updateDatasetQuery, { datasetId: dataset.id, databaseIds }, { context: adminContext })
  })
})
