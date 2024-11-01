import {
  adminContext,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testPlan,
  userContext,
} from '../../../tests/graphqlTestEnvironment'

import canPerformAction from './canPerformAction'
import { createTestApiUsage, createTestPlanRule } from '../../../tests/testDataCreation'
import * as moment from 'moment'
import { ApiUsage } from '../model'

describe('Plan Controller Queries', () => {
  let originalDateNow: any

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
    await setupTestUsers()

    const actionTypes = ['download', 'process', 'delete'] as const
    const periods = [
      { periodType: 'minute', limit: 2 },
      { periodType: 'day', limit: 4 },
      { periodType: 'month', limit: 6 },
      { periodType: 'year', limit: 10 },
    ] as const
    const visibilities = ['private', 'public'] as const
    const sources = ['api', 'web'] as const

    // Create rules for all combinations of actionType, period, visibility, and source
    await Promise.all(
      actionTypes.flatMap((actionType) =>
        periods.flatMap(({ periodType, limit }) =>
          visibilities.flatMap((visibility) =>
            sources.map((source: any) =>
              createTestPlanRule({
                planId: testPlan.id,
                actionType,
                type: 'dataset',
                period: 1,
                periodType,
                limit,
                visibility,
                source,
              })
            )
          )
        )
      )
    )
  })

  afterEach(onAfterEach)

  // const actionTypes = ['download', 'process', 'delete'] as const
  const actionTypes = ['download'] as const
  const testCases = [
    // Testing different limit types with visibility and source
    { visibility: 'public', source: 'api', isAdmin: false, limitType: 'minute', usageCount: 1, expected: true },
    { visibility: 'public', source: 'web', isAdmin: false, limitType: 'minute', usageCount: 2, expected: false },

    // Day limit tests with visibility and source differences
    { visibility: 'private', source: 'api', isAdmin: false, limitType: 'day', usageCount: 1, expected: true },
    { visibility: 'private', source: 'api', isAdmin: false, limitType: 'day', usageCount: 4, expected: false },
    { visibility: 'public', source: 'web', isAdmin: false, limitType: 'day', usageCount: 4, expected: false }, // Not blocked due to visibility mismatch

    // Month limit tests
    { visibility: 'public', source: 'api', isAdmin: false, limitType: 'month', usageCount: 1, expected: true },
    { visibility: 'private', source: 'api', isAdmin: false, limitType: 'month', usageCount: 6, expected: false },

    // // Year limit tests
    { visibility: 'public', source: 'web', isAdmin: false, limitType: 'year', usageCount: 2, expected: true },
    { visibility: 'public', source: 'api', isAdmin: false, limitType: 'year', usageCount: 11, expected: false },
    //
    // // Admin tests to bypass limits
    { visibility: 'private', source: 'api', isAdmin: true, limitType: 'day', usageCount: 7, expected: true },
    { visibility: 'public', source: 'web', isAdmin: true, limitType: 'month', usageCount: 14, expected: true },
    { visibility: 'private', source: 'api', isAdmin: true, limitType: 'year', usageCount: 25, expected: true },
  ]

  actionTypes.forEach((actionType) => {
    testCases.forEach(({ visibility, source, isAdmin, limitType, usageCount, expected }) => {
      it(`should ${expected ? 'allow' : 'block'} ${actionType}
      with visibility=${visibility}, source=${source}, ${limitType} limit, usageCount=${usageCount}
      ${isAdmin ? 'for admin' : 'for user'}`, async() => {
        const context = isAdmin ? adminContext : userContext

        // Set the action date based on the limit type
        let usageDate: moment.Moment
        switch (limitType) {
          case 'minute':
            usageDate = moment.utc()
            break
          case 'day':
            usageDate = moment.utc().startOf('day')
            break
          case 'month':
            usageDate = moment.utc().subtract(2, 'days')
            break
          case 'year':
            usageDate = moment.utc().startOf('year')
            break
          default:
            usageDate = moment.utc()
        }

        // Create usage entries to simulate reaching limits
        for (let i = 0; i < usageCount; i++) {
          await createTestApiUsage({
            actionType,
            type: 'dataset',
            userId: context.user.id,
            visibility,
            source,
            actionDt: usageDate,
          } as Partial<ApiUsage>)
        }

        expect(await canPerformAction(context, {
          actionType,
          type: 'dataset',
          visibility,
          source,
        } as Partial<ApiUsage>)).toBe(expected)
      })
    })
  })

  it('should advance mocked time by 10 minutes', async() => {
    const context = userContext
    const actionType = 'download'
    const visibility = 'public'
    const source = 'api'
    const n = 2

    // Simulate n+1 downloads in the same minute
    for (let i = 0; i < n; i++) {
      await createTestApiUsage({
        actionType,
        type: 'dataset',
        userId: context.user.id,
        visibility,
        source,
      })
    }

    // Verify the action is blocked after n+1 downloads in a minute
    const blocked = await canPerformAction(context, { actionType, type: 'dataset', visibility, source })
    expect(blocked).toBe(false)

    // Advance time by 10 minutes
    Date.now = jest.fn(() => new Date('2024-10-30T10:10:00Z').getTime())

    const allowed = await canPerformAction(context, { actionType, type: 'dataset', visibility, source })
    expect(allowed).toBe(true)
  })
})
