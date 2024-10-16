import {
  createTestPlan, createTestPlanRule,
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

describe('modules/plan/controller (queries)', () => {
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
      planId: TIERS[0].id,
      actionType: 'download',
      period: 1,
      periodType: 'day',
      limit: 5,
      createdAt: moment.utc(moment.utc().toDate()),
    },
    {
      id: 2,
      planId: TIERS[0].id,
      actionType: 'download',
      period: 1,
      periodType: 'week',
      limit: 50,
      createdAt: moment.utc(moment.utc().toDate()),
    },
    {
      id: 3,
      planId: TIERS[2].id,
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
    await connection.query('ALTER SEQUENCE plan_id_seq RESTART WITH 1') // Reset auto-increment to 1
    await connection.query('ALTER SEQUENCE plan_id_seq RESTART WITH 1') // Reset auto-increment to 1
    await connection.query('ALTER SEQUENCE plan_rule_id_seq RESTART WITH 1') // Reset auto-increment to 1

    for (const plan of TIERS) {
      await createTestPlan(plan)
    }
    for (const planRule of TIER_RULES) {
      await createTestPlanRule(planRule)
    }
  })
  afterEach(onAfterEach)

  describe('Query.plan', () => {
    it('should return all plans', async() => {
      const searchQuery = `query {
        allPlans { id name isActive createdAt }
      }`
      const result = await doQuery(searchQuery)

      expect(result.length).toEqual(TIERS.length)
      expect(result).toEqual(TIERS.map((plan) => {
        return { ...plan, createdAt: moment(plan.createdAt).valueOf().toString() }
      }))
    })

    it('should return all planRules', async() => {
      const searchQuery = `query {
        allPlanRules { id planId actionType period periodType limit createdAt }
      }`
      const result = await doQuery(searchQuery)

      expect(result.length).toEqual(TIER_RULES.length)
      expect(result).toEqual(TIER_RULES.map((planRULE: any) => {
        return { ...planRULE, createdAt: moment(planRULE.createdAt).valueOf().toString() }
      }))
    })

    it('should return all planRules filtering by plan id', async() => {
      const query = `query ($planId: Int!) {
        allPlanRules (planId: $planId) { id planId actionType period periodType limit createdAt }
      }`
      let result = await doQuery(query, { planId: TIERS[0].id })
      expect(result.length).toEqual(2)

      result = await doQuery(query, { planId: TIERS[2].id })
      expect(result.length).toEqual(1)

      result = await doQuery(query, { planId: TIERS[1].id })
      expect(result.length).toEqual(0)
    })
  })
})
