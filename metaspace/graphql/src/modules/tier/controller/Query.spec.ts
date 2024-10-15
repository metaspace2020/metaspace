import {
  createTestTier, createTestTierRule,
} from '../../../tests/testDataCreation'
import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
} from '../../../tests/graphqlTestEnvironment'

import * as moment from 'moment'
import { getConnection } from 'typeorm'

describe('modules/tier/controller (queries)', () => {
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
      tierId: TIERS[0].id,
      actionType: 'download',
      period: 1,
      periodType: 'day',
      limit: 5,
      createdAt: moment.utc(moment.utc().toDate()),
    },
    {
      id: 2,
      tierId: TIERS[0].id,
      actionType: 'download',
      period: 1,
      periodType: 'week',
      limit: 50,
      createdAt: moment.utc(moment.utc().toDate()),
    },
    {
      id: 3,
      tierId: TIERS[2].id,
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
    const connection = getConnection()
    await connection.query('ALTER SEQUENCE tier_id_seq RESTART WITH 1') // Reset auto-increment to 1
    await connection.query('ALTER SEQUENCE tier_id_seq RESTART WITH 1') // Reset auto-increment to 1
    await connection.query('ALTER SEQUENCE tier_rule_id_seq RESTART WITH 1') // Reset auto-increment to 1

    for (const tier of TIERS) {
      await createTestTier(tier)
    }
    for (const tierRule of TIER_RULES) {
      await createTestTierRule(tierRule)
    }
  })
  afterEach(onAfterEach)

  describe('Query.tier', () => {
    it('should return all tiers', async() => {
      const searchQuery = `query {
        allTiers { id name isActive createdAt }
      }`
      const result = await doQuery(searchQuery)

      expect(result.length).toEqual(TIERS.length)
      expect(result).toEqual(TIERS.map((tier) => {
        return { ...tier, createdAt: moment(tier.createdAt).valueOf().toString() }
      }))
    })

    it('should return all tierRules', async() => {
      const searchQuery = `query {
        allTierRules { id tierId actionType period periodType limit createdAt }
      }`
      const result = await doQuery(searchQuery)

      expect(result.length).toEqual(TIER_RULES.length)
      expect(result).toEqual(TIER_RULES.map((tierRULE: any) => {
        return { ...tierRULE, createdAt: moment(tierRULE.createdAt).valueOf().toString() }
      }))
    })

    it('should return all tierRules filtering by tier id', async() => {
      const query = `query ($tierId: Int!) {
        allTierRules (tierId: $tierId) { id tierId actionType period periodType limit createdAt }
      }`
      let result = await doQuery(query, { tierId: TIERS[0].id })
      expect(result.length).toEqual(2)

      result = await doQuery(query, { tierId: TIERS[2].id })
      expect(result.length).toEqual(1)

      result = await doQuery(query, { tierId: TIERS[1].id })
      expect(result.length).toEqual(0)
    })
  })
})
