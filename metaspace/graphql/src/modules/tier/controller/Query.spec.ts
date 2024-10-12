import {
  createTestDataset, createTestProject,
  createTestTier, createTestTierRule,
} from '../../../tests/testDataCreation'
import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testUser,
} from '../../../tests/graphqlTestEnvironment'

import * as moment from 'moment'

describe('modules/tier/controller (queries)', () => {
  let userId: string
  const TIERS =
      [
        {
          id: 1,
          name: 'regular',
          isActive: true,
          createdAt: moment.utc(moment.utc().toDate()),
        },
        {
          id: 2,
          name: 'lab',
          isActive: false,
          createdAt: moment.utc(moment.utc().toDate()),
        },
        {
          id: 3,
          name: 'lab',
          isActive: true,
          createdAt: moment.utc(moment.utc().toDate()),
        },
      ]
  const TIER_RULES = [
    {
      id: 1,
      actionType: 'download',
      period: 1,
      periodType: 'day',
      limit: 5,
      createdAt: moment.utc(moment.utc().toDate()),
    },
    {
      id: 2,
      actionType: 'download',
      period: 1,
      periodType: 'week',
      limit: 50,
      createdAt: moment.utc(moment.utc().toDate()),
    },
    {
      id: 3,
      actionType: 'process',
      period: 1,
      periodType: 'day',
      limit: 2,
      createdAt: moment.utc(moment.utc().toDate()),
    },
  ]

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    jest.clearAllMocks()
    await onBeforeEach()
    await setupTestUsers()
    userId = testUser.id
  })
  afterEach(onAfterEach)

  describe('Query.tier', () => {
    it('should return all tiers', async() => {
      const searchQuery = `query {
        allTiers { id name isActive createdAt }
      }`

      for (const tier of TIERS) {
        await createTestTier(tier)
      }

      const result = await doQuery(searchQuery)

      expect(result.length).toEqual(TIERS.length)
      expect(result).toEqual(TIERS.map((tier, i) => {
        return { ...tier, createdAt: moment(tier.createdAt).valueOf().toString() }
      }))
    })

    it('should return all tierRules', async() => {
      const searchQuery = `query {
        allTierRules { id actionType period periodType limit createdAt }
      }`

      for (const tierRule of TIER_RULES) {
        await createTestTierRule(tierRule)
      }

      const result = await doQuery(searchQuery)

      expect(result.length).toEqual(TIER_RULES.length)
      expect(result).toEqual(TIER_RULES.map((tierRULE: any) => {
        delete tierRULE.tierId
        return { ...tierRULE, createdAt: moment(tierRULE.createdAt).valueOf().toString() }
      }))
    })

    it('should return all tierRules filtering by tier id', async() => {
      const tierQuery = `query {
        allTiers { id name isActive createdAt }
      }`

      for (const tierRule of TIER_RULES) {
        await createTestTierRule(tierRule)
      }

      const result = await doQuery(tierQuery)

      const query = `query ($tierId: Int!) {
      allTierRules (tierId: $tierId) { id actionType period periodType limit createdAt }
    }`
      const result2 = await doQuery(query, { tierId: result[0].id })

      expect(result2.length).toEqual(1)
    })
  })
})
