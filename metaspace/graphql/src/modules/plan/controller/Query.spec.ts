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
    { name: 'regular', isActive: true, createdAt: currentTime },
    { name: 'lab', isActive: false, createdAt: currentTime },
    { name: 'lab', isActive: true, createdAt: currentTime },
  ]

  const TIER_RULES: any = [
    { planId: 1, actionType: 'download', period: 1, periodType: 'day', limit: 5, createdAt: currentTime },
    { planId: 1, actionType: 'download', period: 1, periodType: 'week', limit: 50, createdAt: currentTime },
    { planId: 3, actionType: 'process', period: 1, periodType: 'day', limit: 2, createdAt: currentTime },
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

  describe('Query.plan', () => {
    const queryPlanRules = 'query { allPlanRules { planId actionType period periodType limit createdAt } }'

    it('should return all active plans by default', async() => {
      const query = `query {
        allPlans { name isActive createdAt }
      }`

      const result = await doQuery(query)

      const expectedPlans = TIERS.filter(plan => plan.isActive).map(({ createdAt, ...plan }: any) => ({
        ...plan,
        createdAt: moment(createdAt).valueOf().toString(),
      }))

      expect(result.length).toEqual(expectedPlans.length) // Only active plans are returned
      expect(result).toEqual(expectedPlans)
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

    it('should filter allPlans by isActive', async() => {
      const query = `query ($filter: PlanFilter!) {
        allPlans(filter: $filter) { name isActive createdAt }
      }`

      const result = await doQuery(query, { filter: { isActive: true } })

      expect(result.length).toEqual(2)
      expect(result).toEqual(
        TIERS.filter(plan => plan.isActive).map(({ createdAt, ...plan }: any) => ({
          ...plan,
          createdAt: moment(createdAt).valueOf().toString(),
        }))
      )
    })

    it('should filter allPlans by name', async() => {
      const query = `query ($filter: PlanFilter!) {
        allPlans(filter: $filter) { name isActive createdAt }
      }`

      const result = await doQuery(query, { filter: { name: 'lab' } })

      // Only one plan with name "lab" and isActive = true
      const expectedPlans = TIERS.filter(plan => plan.name === 'lab' && plan.isActive).map(({ createdAt, ...plan }: any) => ({
        ...plan,
        createdAt: moment(createdAt).valueOf().toString(),
      }))

      expect(result.length).toEqual(expectedPlans.length) // Only active "lab" plans are returned
      expect(result).toEqual(expectedPlans)
    })

    it('should return a single plan by ID', async() => {
      const query = `query ($id: Int!) {
        plan(id: $id) { name isActive createdAt }
      }`

      const result = await doQuery(query, { id: createdPlans[0].id })

      expect(result).toEqual({
        name: createdPlans[0].name,
        isActive: createdPlans[0].isActive,
        createdAt: moment(createdPlans[0].createdAt).valueOf().toString(),
      })
    })

    it('should return null for a non-existing plan ID', async() => {
      const query = `query ($id: Int!) {
        plan(id: $id) { name isActive createdAt }
      }`

      const result = await doQuery(query, { id: 999 }) // Assuming 999 is not a valid ID
      expect(result).toBeNull()
    })

    it('should return only active plans by default', async() => {
      const query = `query {
    allPlans { name isActive createdAt }
  }`

      const result = await doQuery(query)

      expect(result.length).toEqual(2) // Only two plans with isActive = true
      expect(result).toEqual(
        TIERS.filter(plan => plan.isActive).map(({ createdAt, ...plan }: any) => ({
          ...plan,
          createdAt: moment(createdAt).valueOf().toString(),
        }))
      )
    })

    it('should return inactive plans when explicitly filtered', async() => {
      const query = `query ($filter: PlanFilter!) {
    allPlans(filter: $filter) { name isActive createdAt }
  }`

      const result = await doQuery(query, { filter: { isActive: false } })

      expect(result.length).toEqual(1) // Only one plan with isActive = false
      expect(result).toEqual(
        TIERS.filter(plan => !plan.isActive).map(({ createdAt, ...plan }: any) => ({
          ...plan,
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
