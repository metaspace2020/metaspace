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

describe('modules/plan/controller (queries)', () => {
  const currentTime: any = moment.utc(moment.utc().toDate())

  const TIERS = [
    { name: 'regular', isActive: true, isDefault: false, createdAt: currentTime },
    { name: 'lab', isActive: false, isDefault: false, createdAt: currentTime }, // This plan has isDefault: true
    { name: 'lab', isActive: true, isDefault: true, createdAt: currentTime },
  ]

  const TIER_RULES: any = [
    { planId: 1, actionType: 'download', type: 'dataset', period: 1, periodType: 'day', limit: 5, createdAt: currentTime },
    { planId: 1, actionType: 'download', type: 'dataset', period: 1, periodType: 'week', limit: 50, createdAt: currentTime },
    { planId: 3, actionType: 'process', type: 'dataset', period: 1, periodType: 'day', limit: 2, createdAt: currentTime },
  ]

  let createdPlans: any = []
  let createdPlanRules: any = []

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)

  beforeEach(async() => {
    jest.clearAllMocks()
    await onBeforeEach()
    createdPlans = await Promise.all(TIERS.map(plan => createTestPlan(plan as any)))

    createdPlanRules = await Promise.all(TIER_RULES.map((rule: any, index: number) => {
      const planId = (createdPlans)[index < 2 ? 0 : 2]?.id
      return createTestPlanRule({ ...rule, planId })
    }))

    await setupTestUsers(undefined, true)
  })

  afterEach(onAfterEach)

  describe('Query.allPlans', () => {
    const queryAllPlans = `query ($filter: PlanFilter, $offset: Int, $limit: Int) {
      allPlans(filter: $filter, offset: $offset, limit: $limit) {
        name
        isActive
        isDefault    # Add isDefault here
        createdAt
      }
    }`

    it('should return active plans by default', async() => {
      const result = await doQuery('query { allPlans { name isActive isDefault createdAt } }')

      const expected = TIERS.filter((plan) => plan.isActive).map((plan) => ({
        name: plan.name,
        isActive: plan.isActive,
        isDefault: plan.isDefault, // Ensure this is included
        createdAt: moment(plan.createdAt).valueOf().toString(),
      }))

      expect(result.length).toEqual(expected.length)
      expect(result).toEqual(expected)
    })

    it('should filter plans by isActive', async() => {
      const result = await doQuery(queryAllPlans, { filter: { isActive: false } })

      const expected = TIERS.filter((plan) => !plan.isActive).map(({ createdAt, ...rest }) => ({
        ...rest,
        createdAt: moment(createdAt).valueOf().toString(),
      }))

      expect(result.length).toEqual(1)
      expect(result).toEqual(expected)
    })

    it('should filter plans by name', async() => {
      const result = await doQuery(queryAllPlans, { filter: { name: 'lab' } })

      const expected = TIERS.filter((plan) => plan.name === 'lab' && plan.isActive).map(({ createdAt, ...rest }) => ({
        ...rest,
        createdAt: moment(createdAt).valueOf().toString(),
      }))

      expect(result.length).toEqual(expected.length)
      expect(result).toEqual(expected)
    })
  })

  describe('Query.plansCount', () => {
    const queryPlansCount = `query ($filter: PlanFilter) {
      plansCount(filter: $filter)
    }`

    it('should return total count of plans', async() => {
      const result = await doQuery(queryPlansCount)

      expect(result).toEqual(2) // Total number of plans (active by default)
    })

    it('should return count of active plans', async() => {
      const result = await doQuery(queryPlansCount, { filter: { isActive: true } })

      expect(result).toEqual(2) // Two active plans
    })

    it('should return count of plans filtered by name', async() => {
      const result = await doQuery(queryPlansCount, { filter: { name: 'lab' } })

      expect(result).toEqual(1) // Two plans named 'lab' and active
    })

    it('should return count of plans filtered by isDefault', async() => {
      const result = await doQuery(queryPlansCount, { filter: { isDefault: true } })

      expect(result).toEqual(1) // One default plan
    })
  })

  describe('Query.allPlanRules', () => {
    const queryAllPlanRules = `
      query ($planId: Int, $filter: PlanRuleFilter, $offset: Int, $limit: Int) {
        allPlanRules(planId: $planId, filter: $filter, offset: $offset, limit: $limit) { 
          planId 
          actionType 
          type       # Include type here
          period 
          periodType 
          limit 
          createdAt 
        }
      }`

    it('should return all plan rules', async() => {
      const result = await doQuery(queryAllPlanRules)

      const expected = TIER_RULES.map((rule: any, index: number) => ({
        ...rule,
        planId: createdPlanRules[index].planId,
        createdAt: moment(rule.createdAt).valueOf().toString(),
      }))

      expect(result.length).toEqual(TIER_RULES.length)
      expect(result).toEqual(expected)
    })

    it('should filter plan rules by actionType', async() => {
      const result = await doQuery(queryAllPlanRules, { filter: { actionType: 'download' } })

      const expected = TIER_RULES.filter((rule: any) => rule.actionType === 'download').map((rule: any, index: number) => ({
        ...rule,
        planId: createdPlanRules[index].planId,
        createdAt: moment(rule.createdAt).valueOf().toString(),
      }))

      expect(result.length).toEqual(2)
      expect(result).toEqual(expected)
    })

    it('should paginate plan rules', async() => {
      const result = await doQuery(queryAllPlanRules, { offset: 1, limit: 1 })

      const expected = {
        ...TIER_RULES[1],
        planId: createdPlanRules[1].planId,
        createdAt: moment(TIER_RULES[1].createdAt).valueOf().toString(),
      }

      expect(result.length).toEqual(1)
      expect(result[0]).toEqual(expected)
    })

    it('should filter plan rules by planId', async() => {
      const result = await doQuery(queryAllPlanRules, { planId: createdPlans[0].id })

      const expected = TIER_RULES.slice(0, 2).map((rule: any, index: number) => ({
        ...rule,
        planId: createdPlanRules[index].planId,
        createdAt: moment(rule.createdAt).valueOf().toString(),
      }))

      expect(result.length).toEqual(2)
      expect(result).toEqual(expected)
    })
  })

  describe('Query.planRulesCount', () => {
    const queryPlanRulesCount = `query ($planId: Int, $filter: PlanRuleFilter) {
      planRulesCount(planId: $planId, filter: $filter)
    }`

    it('should return total count of all plan rules', async() => {
      const result = await doQuery(queryPlanRulesCount)

      expect(result).toEqual(3) // Total number of plan rules
    })

    it('should return count of plan rules filtered by actionType', async() => {
      const result = await doQuery(queryPlanRulesCount, { filter: { actionType: 'download' } })

      expect(result).toEqual(2) // Only two plan rules with actionType 'download'
    })

    it('should return count of plan rules filtered by planId', async() => {
      const result = await doQuery(queryPlanRulesCount, { planId: createdPlans[0].id })

      expect(result).toEqual(2) // Two plan rules belong to the first plan
    })

    it('should return count of plan rules filtered by type', async() => {
      const result = await doQuery(queryPlanRulesCount, { filter: { type: 'dataset' } })

      expect(result).toEqual(3) // Only one rule has type 'dataset'
    })
  })

  describe('Query.planRule', () => {
    const queryPlanRule = `query ($id: Int!) {
      planRule(id: $id) {
        id
        planId
        actionType
        type
        period
        periodType
        limit
        createdAt
      }
    }`

    it('should return a specific plan rule by id', async() => {
      const targetPlanRule = createdPlanRules[0]
      const result = await doQuery(queryPlanRule, { id: targetPlanRule.id })

      const expected = {
        id: targetPlanRule.id,
        planId: targetPlanRule.planId,
        actionType: TIER_RULES[0].actionType,
        type: TIER_RULES[0].type,
        period: TIER_RULES[0].period,
        periodType: TIER_RULES[0].periodType,
        limit: TIER_RULES[0].limit,
        createdAt: moment(TIER_RULES[0].createdAt).valueOf().toString(),
      }

      expect(result).toEqual(expected)
    })

    it('should return null for non-existent plan rule id', async() => {
      const result = await doQuery(queryPlanRule, { id: 99999 })
      expect(result).toBeNull()
    })
  })
})
