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
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    jest.clearAllMocks()
    await onBeforeEach()
    await setupTestUsers()
    await Promise.all([
      createTestPlanRule({ planId: testPlan.id, actionType: 'download', period: 1, periodType: 'day', limit: 1 }),
      createTestPlanRule({ planId: testPlan.id, actionType: 'download', period: 1, periodType: 'month', limit: 2 }),
    ])
  })
  afterEach(onAfterEach)

  describe('canPerformAction', () => {
    it('allows download within daily limit', async() => {
      await createTestApiUsage({ actionType: 'download', userId: userContext.user.id } as Partial<ApiUsage>)
      expect(await canPerformAction(userContext, 'download')).toBe(true)
    })

    it('blocks download over daily limit', async() => {
      await Promise.all([
        createTestApiUsage({ actionType: 'download', userId: userContext.user.id }),
        createTestApiUsage({ actionType: 'download', userId: userContext.user.id }),
      ])
      expect(await canPerformAction(userContext, 'download')).toBe(false)
    })

    it('allows admin to exceed daily limit', async() => {
      await Promise.all([
        createTestApiUsage({ actionType: 'download', userId: userContext.user.id }),
        createTestApiUsage({ actionType: 'download', userId: userContext.user.id }),
      ])
      expect(await canPerformAction(adminContext, 'download')).toBe(true)
    })

    it('allows download within MONTHly limit', async() => {
      await createTestApiUsage({ actionType: 'download', userId: userContext.user.id, actionDt: moment.utc().subtract(2, 'day') })
      expect(await canPerformAction(userContext, 'download')).toBe(true)
    })

    it('blocks download over MONTHly limit', async() => {
      await Promise.all([
        createTestApiUsage({ actionType: 'download', userId: userContext.user.id, actionDt: moment.utc().subtract(2, 'day') as moment.Moment }),
        createTestApiUsage({ actionType: 'download', userId: userContext.user.id }),
        createTestApiUsage({ actionType: 'download', userId: userContext.user.id }),
      ])
      expect(await canPerformAction(userContext, 'download')).toBe(false)
    })

    it('allows admin to exceed MONTHly limit', async() => {
      await Promise.all([
        createTestApiUsage({ actionType: 'download', userId: userContext.user.id, actionDt: moment.utc().subtract(2, 'day') as moment.Moment }),
        createTestApiUsage({ actionType: 'download', userId: userContext.user.id }),
        createTestApiUsage({ actionType: 'download', userId: userContext.user.id }),
      ])
      expect(await canPerformAction(adminContext, 'download')).toBe(true)
    })
  })
})
