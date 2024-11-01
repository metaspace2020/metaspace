import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  testEntityManager,
} from '../../../tests/graphqlTestEnvironment'

import {
  createTestMolecularDB,
  createTestPlan,
  createTestPlanRule, createTestUser,
} from '../../../tests/testDataCreation'
import { getConnection } from 'typeorm'
import { getContextForTest } from '../../../getContext'

describe('Dataset plan checks', () => {
  let originalDateNow: any
  let database: any
  let proPlan: any
  let regularPlan: any
  let testUserReg: any
  let testUserPro: any

  const sampleMetadata = {
    Data_Type: 'Imaging MS',
    MS_Analysis: {
      Analyzer: 'FTICR',
      Polarity: 'Positive',
      Ionisation_Source: 'MALDI',
      Detector_Resolving_Power: {
        mz: 400,
        Resolving_Power: 140000,
      },
      Pixel_Size: { Xaxis: 50, Yaxis: 50 },
    },
    Submitted_By: {
      Submitter: {
        Email: 'user@example.com',
        Surname: 'Surname',
        First_Name: 'Name',
      },
      Institution: 'Genentech',
      Principal_Investigator: {
        Email: 'pi@example.com',
        Surname: 'Surname',
        First_Name: 'Name',
      },
    },
    Sample_Information: {
      Organism: 'Mus musculus (mouse)',
      Condition: 'Dosed vs. vehicle',
      Organism_Part: 'EMT6 Tumors',
      Sample_Growth_Conditions: 'NA',
    },
    Sample_Preparation: {
      MALDI_Matrix: '2,5-dihydroxybenzoic acid (DHB)',
      Tissue_Modification: 'N/A',
      Sample_Stabilisation: 'Fresh frozen',
      MALDI_Matrix_Application: 'TM sprayer',
    },
    Additional_Information: {
      Publication_DOI: 'NA',
      Expected_Molecules_Freetext: 'tryptophan pathway',
      Sample_Preparation_Freetext: 'NA',
      Additional_Information_Freetext: 'NA',
    },
  }

  beforeAll(async() => {
    await onBeforeAll()
    originalDateNow = Date.now

    // Mock Date.now to return a specific timestamp
    Date.now = jest.fn(() => new Date('2024-10-30T10:00:00Z').getTime())
  })

  afterAll(async() => {
    await onAfterAll()
    Date.now = originalDateNow
  })

  beforeEach(async() => {
    jest.clearAllMocks()

    await onBeforeEach()

    const connection = getConnection()
    await connection.query('ALTER SEQUENCE plan_id_seq RESTART WITH 1')
    await connection.query('ALTER SEQUENCE plan_rule_id_seq RESTART WITH 1')

    regularPlan = await createTestPlan({
      name: 'regular',
      isActive: true,
    })
    proPlan = await createTestPlan({
      name: 'pro',
      isActive: true,
    })

    await createTestPlanRule({
      planId: regularPlan.id,
      actionType: 'create',
      period: 1,
      periodType: 'hour',
      limit: 0,
      type: 'dataset',
      visibility: 'private',
    })

    await createTestPlanRule({
      planId: proPlan.id,
      actionType: 'create',
      period: 1,
      periodType: 'hour',
      limit: 1,
      type: 'dataset',
      visibility: 'private',
    })

    database = await createTestMolecularDB({ name: 'HMDB-v4', isPublic: true, groupId: null })
    testUserReg = await createTestUser({ planId: regularPlan.id })
    testUserPro = await createTestUser({ planId: proPlan.id })
  })

  afterEach(onAfterEach)

  const createDatasetQuery = `mutation createDataset($databaseIds: [Int!], $isPublic: Boolean) {
      createDataset(
        input: {
          name: "ds-name"
          inputPath: "input-path"
          databaseIds: $databaseIds          
          metadataJson: ${JSON.stringify(JSON.stringify(sampleMetadata))}
          adducts: ["+H"]
          isPublic: $isPublic
          submitterId: ""
        }
      )
    }`

  it('should not be able to create private dataset as a regular', async() => {
    const context = getContextForTest({ ...testUserReg }, testEntityManager)
    await expect(doQuery(createDatasetQuery, { databaseIds: [database.id], isPublic: false }, { context })).rejects.toThrow('Limit reached')
  })

  it('should be able to create private dataset as a pro', async() => {
    const context = getContextForTest({ ...testUserPro }, testEntityManager)
    await expect(doQuery(createDatasetQuery, { databaseIds: [database.id], isPublic: false }, { context })).resolves.not.toThrow()
  })

  it('should not be able to create private dataset, but can create as many public as a regular', async() => {
    const context = getContextForTest({ ...testUserReg }, testEntityManager)
    await expect(doQuery(createDatasetQuery, { databaseIds: [database.id], isPublic: true }, { context })).resolves.not.toThrow()
    Date.now = jest.fn(() => new Date('2024-10-30T10:01:00Z').getTime())
    await expect(doQuery(createDatasetQuery, { databaseIds: [database.id], isPublic: true }, { context })).resolves.not.toThrow()
    Date.now = jest.fn(() => new Date('2024-10-30T10:02:00Z').getTime())
    await expect(doQuery(createDatasetQuery, { databaseIds: [database.id], isPublic: false }, { context })).rejects.toThrow('Limit reached')
  })
})
