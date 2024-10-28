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
  const currentTime: any = moment.utc(moment.utc().toDate())

  const TIERS = [
    { name: 'regular', isActive: true, createdAt: currentTime },
    { name: 'lab', isActive: false, createdAt: currentTime },
    { name: 'lab', isActive: true, createdAt: currentTime },
  ]

  const TIER_RULES: any = [
    { planId: 1, actionType: 'DOWNLOAD', period: 1, periodType: 'DAY', limit: 5, createdAt: currentTime },
    { planId: 1, actionType: 'DOWNLOAD', period: 1, periodType: 'WEEK', limit: 50, createdAt: currentTime },
    { planId: 3, actionType: 'PROCESS', period: 1, periodType: 'DAY', limit: 2, createdAt: currentTime },
  ]

  let createdPlans: any = []
  let createdPlanRules: any = []

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)

  beforeEach(async() => {
    jest.clearAllMocks()
    await onBeforeEach()

    const connection = getConnection()
    await connection.query('ALTER SEQUENCE plan_id_seq RESTART WITH 1')
    await connection.query('ALTER SEQUENCE plan_rule_id_seq RESTART WITH 1')

    createdPlans = await Promise.all(TIERS.map(plan => createTestPlan(plan as any)))

    createdPlanRules = await Promise.all(TIER_RULES.map((rule: any, index: number) => {
      const planId = (createdPlans)[index < 2 ? 0 : 2]?.id
      return createTestPlanRule({ ...rule, planId })
    }))

    await setupTestUsers(undefined, true)
  })

  afterEach(onAfterEach)

  describe('Query.plan', () => {
    const queryPlans = 'query { allPlans { name isActive createdAt } }'
    const queryPlanRules = 'query { allPlanRules { planId actionType period periodType limit createdAt } }'

    it('should return all plans', async() => {
      const result = await doQuery(queryPlans)
      expect(result.length).toEqual(TIERS.length)
      expect(result).toEqual(
        TIERS.map(({ createdAt, ...plan }: any) => ({
          ...plan,
          createdAt: moment(createdAt).valueOf().toString(),
        }))
      )
    })

    it('should return all planRules', async() => {
      const result = await doQuery(queryPlanRules)

      expect(result.length).toEqual(TIER_RULES.length)
      expect(result).toEqual(
        TIER_RULES.map(({ createdAt, ...rule }: any, index: number) => ({
          ...rule,
          planId: createdPlanRules[index].planId,
          createdAt: moment(createdAt).valueOf().toString(),
        }))
      )
    })

    it('should filter planRules by plan id', async() => {
      const query = `query ($planId: Int!) {
        allPlanRules (planId: $planId) { planId actionType period periodType limit createdAt }
      }`

      const results = await Promise.all([
        doQuery(query, { planId: createdPlans[0].id }),
        doQuery(query, { planId: createdPlans[1].id }),
        doQuery(query, { planId: createdPlans[2].id }),
      ])

      expect(results[0].length).toEqual(2)
      expect(results[1].length).toEqual(0)
      expect(results[2].length).toEqual(1)
    })
  })
})
