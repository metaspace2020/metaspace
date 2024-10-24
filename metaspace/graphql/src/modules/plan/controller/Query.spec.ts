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

interface Plan {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: Date;
}

interface PlanRule {
  id: number;
  planId: number;
  actionType: string;
  period: number;
  periodType: string;
  limit: number;
  createdAt: Date;
}

describe('modules/plan/controller (queries)', () => {
  const currentTime: any = moment.utc(moment.utc().toDate())

  const TIERS: Plan[] = [
    { id: 1, name: 'regular', isActive: true, createdAt: currentTime },
    { id: 2, name: 'lab', isActive: false, createdAt: currentTime },
    { id: 3, name: 'lab', isActive: true, createdAt: currentTime },
  ]

  const TIER_RULES: PlanRule[] = [
    { id: 1, planId: 1, actionType: 'download', period: 1, periodType: 'day', limit: 5, createdAt: currentTime },
    { id: 2, planId: 1, actionType: 'download', period: 1, periodType: 'week', limit: 50, createdAt: currentTime },
    { id: 3, planId: 3, actionType: 'process', period: 1, periodType: 'day', limit: 2, createdAt: currentTime },
  ]

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)

  beforeEach(async() => {
    jest.clearAllMocks()
    await onBeforeEach()

    const connection = getConnection()
    await connection.query('ALTER SEQUENCE plan_id_seq RESTART WITH 1')
    await connection.query('ALTER SEQUENCE plan_rule_id_seq RESTART WITH 1')

    await Promise.all(TIERS.map(plan => createTestPlan(plan as any)))
    await Promise.all(TIER_RULES.map(rule => createTestPlanRule(rule as any)))

    await setupTestUsers(undefined, true)
  })

  afterEach(onAfterEach)

  describe('Query.plan', () => {
    const queryPlans = 'query { allPlans { id name isActive createdAt } }'
    const queryPlanRules = 'query { allPlanRules { id planId actionType period periodType limit createdAt } }'

    it('should return all plans', async() => {
      const result = await doQuery(queryPlans)
      expect(result.length).toEqual(TIERS.length)
      expect(result).toEqual(
        TIERS.map(({ createdAt, ...plan }: Plan) => ({
          ...plan,
          createdAt: moment(createdAt).valueOf().toString(),
        }))
      )
    })

    it('should return all planRules', async() => {
      const result = await doQuery(queryPlanRules)

      expect(result.length).toEqual(TIER_RULES.length)
      expect(result).toEqual(
        TIER_RULES.map(({ createdAt, ...rule }: PlanRule) => ({
          ...rule,
          createdAt: moment(createdAt).valueOf().toString(),
        }))
      )
    })

    it('should filter planRules by plan id', async() => {
      const query = `query ($planId: Int!) {
        allPlanRules (planId: $planId) { id planId actionType period periodType limit createdAt }
      }`

      const results = await Promise.all([
        doQuery(query, { planId: 1 }),
        doQuery(query, { planId: 3 }),
        doQuery(query, { planId: 2 }),
      ])

      expect(results[0].length).toEqual(2)
      expect(results[1].length).toEqual(1)
      expect(results[2].length).toEqual(0)
    })
  })
})
