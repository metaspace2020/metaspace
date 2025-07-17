import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  adminContext,
} from '../../../tests/graphqlTestEnvironment'
import * as moment from 'moment'
import fetch from 'node-fetch'
import config from '../../../utils/config'

// Mock node-fetch
jest.mock('node-fetch')
const mockFetch = fetch as jest.Mock

describe('modules/plan/controller (queries)', () => {
  const currentTime: any = moment.utc(moment.utc().toDate())
  let originalManagerApiUrl: string | undefined

  const TIERS = [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      tier: 'free',
      name: 'regular',
      isActive: true,
      isDefault: false,
      createdAt: currentTime,
      displayOrder: 0,
      description: 'Regular plan',
      pricingOptions: [
        {
          id: 'price_free_monthly',
          periodMonths: 1,
          priceCents: 0,
          displayName: 'Monthly',
          isActive: true,
          displayOrder: 0,
        },
        {
          id: 'price_free_yearly',
          periodMonths: 12,
          priceCents: 0,
          displayName: 'Yearly',
          isActive: true,
          displayOrder: 1,
        },
      ],
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      tier: 'lab',
      name: 'lab',
      isActive: false,
      isDefault: false,
      createdAt: currentTime,
      displayOrder: 1,
      description: 'Lab plan',
      pricingOptions: [
        {
          id: 'price_lab_monthly',
          periodMonths: 1,
          priceCents: 5000,
          displayName: 'Monthly',
          isActive: true,
          displayOrder: 0,
        },
        {
          id: 'price_lab_yearly',
          periodMonths: 12,
          priceCents: 50000,
          displayName: 'Yearly',
          isActive: true,
          displayOrder: 1,
        },
      ],
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      tier: 'pro',
      name: 'lab',
      isActive: true,
      isDefault: true,
      createdAt: currentTime,
      displayOrder: 2,
      description: 'Pro lab plan',
      pricingOptions: [
        {
          id: 'price_pro_monthly',
          periodMonths: 1,
          priceCents: 10000,
          displayName: 'Monthly',
          isActive: true,
          displayOrder: 0,
        },
        {
          id: 'price_pro_yearly',
          periodMonths: 12,
          priceCents: 100000,
          displayName: 'Yearly',
          isActive: true,
          displayOrder: 1,
        },
      ],
    },
  ]

  const TIER_RULES = [
    { id: 1, planId: '550e8400-e29b-41d4-a716-446655440001', actionType: 'download', type: 'dataset', period: 1, periodType: 'day', limit: 5, createdAt: currentTime },
    { id: 2, planId: '550e8400-e29b-41d4-a716-446655440001', actionType: 'download', type: 'dataset', period: 1, periodType: 'week', limit: 50, createdAt: currentTime },
    { id: 3, planId: '550e8400-e29b-41d4-a716-446655440003', actionType: 'process', type: 'dataset', period: 1, periodType: 'day', limit: 2, createdAt: currentTime },
  ]

  const API_USAGES = [
    {
      id: 1,
      userId: 'user1',
      datasetId: 'dataset1',
      actionType: 'download',
      type: 'dataset',
      source: 'web',
      actionDt: currentTime,
    },
    {
      id: 2,
      userId: 'user1',
      datasetId: 'dataset2',
      actionType: 'process',
      type: 'dataset',
      source: 'api',
      actionDt: currentTime,
    },
    {
      id: 3,
      userId: 'user2',
      datasetId: 'dataset1',
      actionType: 'download',
      type: 'dataset',
      source: 'web',
      actionDt: currentTime,
    },
  ]

  beforeAll(async() => {
    await onBeforeAll()
    originalManagerApiUrl = config.manager_api_url
    // Set the manager API URL
    config.manager_api_url = 'https://test-api.metaspace.example'
  })

  afterAll(async() => {
    await onAfterAll()
    // Restore original config value if it was defined
    if (originalManagerApiUrl !== undefined) {
      config.manager_api_url = originalManagerApiUrl
    } else {
      // If it was undefined, we need to use delete to remove the property
      delete (config as any).manager_api_url
    }
  })

  beforeEach(async() => {
    jest.clearAllMocks()
    mockFetch.mockClear()
    await onBeforeEach()
    await setupTestUsers()
  })

  afterEach(onAfterEach)

  describe('Query.plan', () => {
    const queryPlan = `query ($id: String!) {
      plan(id: $id) {
        id
        tier
        name
        isActive
        isDefault
        createdAt
        displayOrder
        description
        pricingOptions {
          id
          periodMonths
          priceCents
          displayName
          isActive
          displayOrder
        }
      }
    }`

    it('should return a plan by id', async() => {
      const planId = '550e8400-e29b-41d4-a716-446655440001'
      const expectedPlan = TIERS.find(plan => plan.id === planId)

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...expectedPlan,
          createdAt: moment(expectedPlan!.createdAt).valueOf().toString(),
        }),
      })

      const result = await doQuery(queryPlan, { id: planId })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/plans/550e8400-e29b-41d4-a716-446655440001',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )

      expect(result).toEqual({
        ...expectedPlan,
        createdAt: moment(expectedPlan!.createdAt).valueOf().toString(),
      })
    })

    it('should return null if plan not found', async() => {
      // Mock fetch to return null for a non-existent plan
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      const result = await doQuery(queryPlan, { id: '550e8400-e29b-41d4-a716-999999999999' })

      expect(result).toBeNull()
    })
  })

  describe('Query.allPlans', () => {
    const queryAllPlans = `query ($filter: PlanFilter, $offset: Int, $limit: Int) {
      allPlans(filter: $filter, offset: $offset, limit: $limit) {
        tier
        name
        isActive
        isDefault
        createdAt
        displayOrder
        description
        pricingOptions {
          id
          periodMonths
          priceCents
          displayName
          isActive
          displayOrder
        }
      }
    }`

    it('should return active plans by default', async() => {
      const activePlans = TIERS.filter(plan => plan.isActive)

      // Mock the fetch response with proper data structure
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: activePlans.map(plan => ({
            ...plan,
            createdAt: moment(plan.createdAt).valueOf().toString(),
          })),
          meta: { total: activePlans.length },
        }),
      })

      const result = await doQuery(queryAllPlans)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/test-api\.metaspace\.example\/api\/plans/),
        expect.any(Object)
      )

      const expected = activePlans.map(plan => ({
        tier: plan.tier,
        name: plan.name,
        isActive: plan.isActive,
        isDefault: plan.isDefault,
        createdAt: moment(plan.createdAt).valueOf().toString(),
        displayOrder: plan.displayOrder,
        description: plan.description,
        pricingOptions: plan.pricingOptions,
      }))

      expect(result).toEqual(expected)
    })

    it('should filter plans by isActive', async() => {
      const inactivePlans = TIERS.filter(plan => !plan.isActive)

      // Mock the fetch response with proper data structure
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: inactivePlans.map(plan => ({
            ...plan,
            createdAt: moment(plan.createdAt).valueOf().toString(),
          })),
          meta: { total: inactivePlans.length },
        }),
      })

      const result = await doQuery(queryAllPlans, { filter: { isActive: false } })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/.*filter%5BisActive%5D=false.*/),
        expect.any(Object)
      )

      // Only include fields that are in the GraphQL query
      const expected = inactivePlans.map(({
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        id,
        createdAt, ...rest
      }) => ({
        ...rest,
        createdAt: moment(createdAt).valueOf().toString(),
      }))

      expect(result).toEqual(expected)
    })

    it('should filter plans by name', async() => {
      const filteredPlans = TIERS.filter(plan => plan.name === 'lab' && plan.isActive)

      // Mock the fetch response with proper data structure
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: filteredPlans.map(plan => ({
            ...plan,
            createdAt: moment(plan.createdAt).valueOf().toString(),
          })),
          meta: { total: filteredPlans.length },
        }),
      })

      const result = await doQuery(queryAllPlans, { filter: { name: 'lab' } })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/.*filter%5Bname%5D=lab.*/),
        expect.any(Object)
      )

      // Only include fields that are in the GraphQL query
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const expected = filteredPlans.map(({ id, createdAt, ...rest }) => ({
        ...rest,
        createdAt: moment(createdAt).valueOf().toString(),
      }))

      expect(result).toEqual(expected)
    })
  })

  describe('Query.plansCount', () => {
    const queryPlansCount = `query ($filter: PlanFilter) {
      plansCount(filter: $filter)
    }`

    it('should return total count of plans', async() => {
      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          count: 2,
          meta: { total: 2 },
        }),
      })

      const result = await doQuery(queryPlansCount)

      // The actual endpoint might be /api/plans with meta.total instead of /plans/count
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/test-api\.metaspace\.example\/api\/plans/),
        expect.any(Object)
      )

      expect(result).toEqual(2)
    })

    it('should return count of active plans', async() => {
      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          count: 2,
          meta: { total: 2 },
        }),
      })

      const result = await doQuery(queryPlansCount, { filter: { isActive: true } })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/.*filter%5BisActive%5D=true.*/),
        expect.any(Object)
      )

      expect(result).toEqual(2)
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

    it('should return a plan rule by id', async() => {
      const ruleId = 1
      const expectedRule = TIER_RULES.find(rule => rule.id === ruleId)

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...expectedRule,
          createdAt: moment(expectedRule!.createdAt).valueOf().toString(),
        }),
      })

      const result = await doQuery(queryPlanRule, { id: ruleId })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/plan-rules/1',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )

      expect(result).toEqual({
        ...expectedRule,
        createdAt: moment(expectedRule!.createdAt).valueOf().toString(),
      })
    })
  })

  describe('Query.allPlanRules', () => {
    const queryAllPlanRules = `
      query ($planId: String, $filter: PlanRuleFilter, $offset: Int, $limit: Int) {
        allPlanRules(planId: $planId, filter: $filter, offset: $offset, limit: $limit) { 
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

    it('should return all plan rules', async() => {
      // Mock the fetch response with proper data structure
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: TIER_RULES.map(rule => ({
            ...rule,
            createdAt: moment(rule.createdAt).valueOf().toString(),
          })),
          meta: { total: TIER_RULES.length },
        }),
      })

      const result = await doQuery(queryAllPlanRules)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/test-api\.metaspace\.example\/api\/plan-rules/),
        expect.any(Object)
      )

      const expected = TIER_RULES.map(rule => ({
        ...rule,
        createdAt: moment(rule.createdAt).valueOf().toString(),
      }))

      expect(result).toEqual(expected)
    })

    it('should filter plan rules by actionType', async() => {
      const filteredRules = TIER_RULES.filter(rule => rule.actionType === 'download')

      // Mock the fetch response with proper data structure
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: filteredRules.map(rule => ({
            ...rule,
            createdAt: moment(rule.createdAt).valueOf().toString(),
          })),
          meta: { total: filteredRules.length },
        }),
      })

      const result = await doQuery(queryAllPlanRules, { filter: { actionType: 'download' } })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/.*filter%5BactionType%5D=download.*/),
        expect.any(Object)
      )

      const expected = filteredRules.map(rule => ({
        ...rule,
        createdAt: moment(rule.createdAt).valueOf().toString(),
      }))

      expect(result).toEqual(expected)
    })

    it('should filter plan rules by planId', async() => {
      const planId = '550e8400-e29b-41d4-a716-446655440001'
      const filteredRules = TIER_RULES.filter(rule => rule.planId === planId)

      // Mock the fetch response with proper data structure
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: filteredRules.map(rule => ({
            ...rule,
            createdAt: moment(rule.createdAt).valueOf().toString(),
          })),
          meta: { total: filteredRules.length },
        }),
      })

      const result = await doQuery(queryAllPlanRules, { planId })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/.*planId=550e8400-e29b-41d4-a716-446655440001.*/),
        expect.any(Object)
      )

      const expected = filteredRules.map(rule => ({
        ...rule,
        createdAt: moment(rule.createdAt).valueOf().toString(),
      }))

      expect(result).toEqual(expected)
    })
  })

  describe('Query.planRulesCount', () => {
    const queryPlanRulesCount = `query ($planId: String, $filter: PlanRuleFilter) {
      planRulesCount(planId: $planId, filter: $filter)
    }`

    it('should return total count of all plan rules', async() => {
      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          meta: { total: 3 },
        }),
      })

      const result = await doQuery(queryPlanRulesCount)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/test-api\.metaspace\.example\/api\/plan-rules/),
        expect.any(Object)
      )

      expect(result).toEqual(3)
    })

    it('should return count of plan rules filtered by actionType', async() => {
      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          meta: { total: 2 },
        }),
      })

      const result = await doQuery(queryPlanRulesCount, { filter: { actionType: 'download' } })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/.*filter%5BactionType%5D=download.*/),
        expect.any(Object)
      )

      expect(result).toEqual(2)
    })
  })

  describe('Query.allApiUsages', () => {
    const queryAllApiUsages = `
      query ($filter: ApiUsageFilter, $offset: Int, $limit: Int) {
        allApiUsages(filter: $filter, offset: $offset, limit: $limit) {
          id
          userId
          datasetId
          actionType
          type
          source
        }
      }`

    it('should return all API usages for admin', async() => {
      // Strip actionDt from API_USAGES for the expected result
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const expectedApiUsages = API_USAGES.map(({ actionDt, ...rest }) => rest)

      // Mock the fetch response with the expected data format from the API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: expectedApiUsages,
        }),
      })

      const result = await doQuery(queryAllApiUsages, {}, { context: adminContext })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/test-api\.metaspace\.example\/api\/api-usages/),
        expect.any(Object)
      )

      expect(result).toEqual(expectedApiUsages)
    })

    it('should filter API usages by userId', async() => {
      const userId = 'user1'
      const filteredUsages = API_USAGES
        .filter(usage => usage.userId === userId) // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ actionDt, ...rest }) => rest) // Strip actionDt for comparison

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: filteredUsages,
        }),
      })

      const result = await doQuery(queryAllApiUsages, { filter: { userId } }, { context: adminContext })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/.*filter%5BuserId%5D=user1.*/),
        expect.any(Object)
      )

      expect(result).toEqual(filteredUsages)
    })

    it('should throw an error for non-admin users', async() => {
      await expect(doQuery(queryAllApiUsages)).rejects.toThrow('Access denied')
    })
  })

  describe('Query.apiUsagesCount', () => {
    const queryApiUsagesCount = `query ($filter: ApiUsageFilter) {
      apiUsagesCount(filter: $filter)
    }`

    it('should return total count of API usages for admin', async() => {
      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          meta: { total: 3 },
        }),
      })

      const result = await doQuery(queryApiUsagesCount, {}, { context: adminContext })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/test-api\.metaspace\.example\/api\/api-usages/),
        expect.any(Object)
      )

      expect(result).toEqual(3)
    })

    it('should throw an error for non-admin users', async() => {
      await expect(doQuery(queryApiUsagesCount)).rejects.toThrow('Access denied')
    })
  })
})
