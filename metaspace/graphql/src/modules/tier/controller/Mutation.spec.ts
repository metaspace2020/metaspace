import {
  adminContext,
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testUser,
  userContext,
} from '../../../tests/graphqlTestEnvironment'

import * as moment from 'moment'
import { getConnection } from 'typeorm'
import { Project as ProjectType } from '../../../binding'

describe('modules/tier/controller (mutations)', () => {
  let userId: string
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    jest.clearAllMocks()
    await onBeforeEach()
    await setupTestUsers()
    userId = testUser.id
    const connection = getConnection()
    await connection.query('ALTER SEQUENCE tier_id_seq RESTART WITH 1') // Reset auto-increment to 1
    await connection.query('ALTER SEQUENCE tier_id_seq RESTART WITH 1') // Reset auto-increment to 1
    await connection.query('ALTER SEQUENCE tier_rule_id_seq RESTART WITH 1') // Reset auto-increment to 1
  })
  afterEach(onAfterEach)

  describe('Mutation.tier', () => {
    it('should create one tier as admin', async() => {
      const tierDetails = {
        name: 'regular',
        isActive: true,
        createdAt: moment.utc().toISOString(),

      }
      const createTier = `mutation ($name: String!, $isActive: Boolean!) {
            createTier(name: $name, isActive: $isActive) { name isActive createdAt }
        }`

      const result = await doQuery(createTier, tierDetails, { context: adminContext })
      expect(result.name).toEqual(tierDetails.name)
      expect(result.isActive).toEqual(tierDetails.isActive)
    })

    it('should fail to create one tier as user', async() => {
      const tierDetails = {
        name: 'regular',
        isActive: true,
        createdAt: moment.utc().toISOString(),

      }
      const createTier = `mutation ($name: String!, $isActive: Boolean!) {
            createTier(name: $name, isActive: $isActive) { name isActive createdAt }
        }`
      try {
        await doQuery(createTier, tierDetails, { context: userContext })
      } catch (e) {
        expect(e.message).toEqual('Unauthorized')
      }
    })

    it('should update Tier', async() => {
      const tierDetails = {
        name: 'regular',
        isActive: true,
        createdAt: moment.utc().toISOString(),

      }
      const createTier = `mutation ($name: String!, $isActive: Boolean!) {
            createTier(name: $name, isActive: $isActive) { id name isActive createdAt }
        }`
      const updateTier = `mutation ($tierId: Int!, $name: String!, $isActive: Boolean!) {
            updateTier(tierId: $tierId, name: $name, isActive: $isActive) { id name isActive createdAt }
        }`

      const result = await doQuery(createTier, tierDetails, { context: adminContext })
      expect(result.name).toEqual(tierDetails.name)
      expect(result.isActive).toEqual(tierDetails.isActive)

      const resultUpdate = await doQuery(updateTier, {
        tierId: result.id,
        name: 'updated',
        isActive: false,
      }, { context: adminContext })

      expect(result.name).not.toEqual(resultUpdate.name)
      expect(resultUpdate.name).toEqual('updated')
      expect(resultUpdate.isActive).toEqual(false)
    })
  })
})
