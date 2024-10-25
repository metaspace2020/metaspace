import {
  adminContext,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers, testPlan, userContext,
} from '../../../tests/graphqlTestEnvironment'

import canPerformAction from './canPerformAction'
import { createTestApiUsage, createTestPlanRule } from '../../../tests/testDataCreation'
import * as moment from 'moment/moment'
import { Moment } from 'moment'

describe('modules/plan/controller (queries)', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)

  beforeEach(async() => {
    jest.clearAllMocks()
    await onBeforeEach()
    await setupTestUsers()
    await createTestPlanRule({
      planId: testPlan.id,
      actionType: 'download',
      period: 1,
      periodType: 'day',
      limit: 1,
    })
    await createTestPlanRule({
      planId: testPlan.id,
      actionType: 'download',
      period: 1,
      periodType: 'month',
      limit: 2,
    })
  })

  afterEach(onAfterEach)

  describe('Plan.canPerformAction', () => {
    it('should be able to download under the limit per day', async() => {
      await createTestApiUsage({ actionType: 'download', userId: userContext.user.id })
      await createTestApiUsage({ actionType: 'upload', userId: userContext.user.id })
      expect(await canPerformAction(userContext, 'download')).toBe(true)
    })
    it('should not be able to download over the limit per day', async() => {
      await createTestApiUsage({ actionType: 'download', userId: userContext.user.id })
      await createTestApiUsage({ actionType: 'download', userId: userContext.user.id })
      expect(await canPerformAction(userContext, 'download')).toBe(false)
    })
    it('should  be able to download over the limit per day if an admin', async() => {
      await createTestApiUsage({ actionType: 'download', userId: userContext.user.id })
      await createTestApiUsage({ actionType: 'download', userId: userContext.user.id })
      expect(await canPerformAction(adminContext, 'download')).toBe(true)
    })
    it('should  be able to download under the limit per month', async() => {
      await createTestApiUsage({
        actionType: 'download',
        userId: userContext.user.id,
        actionDt: moment.utc().subtract(2, 'day') as unknown as Moment,
      })
      await createTestApiUsage({ actionType: 'download', userId: userContext.user.id })
      expect(await canPerformAction(userContext, 'download')).toBe(true)
    })
    it('should not be able to download over the limit per month', async() => {
      await createTestApiUsage({
        actionType: 'download',
        userId: userContext.user.id,
        actionDt: moment.utc().subtract(2, 'day') as unknown as Moment,
      })
      await createTestApiUsage({ actionType: 'download', userId: userContext.user.id })
      await createTestApiUsage({ actionType: 'download', userId: userContext.user.id })
      expect(await canPerformAction(userContext, 'download')).toBe(false)
    })
    it('should be able to download over the limit per month as admin', async() => {
      await createTestApiUsage({
        actionType: 'download',
        userId: userContext.user.id,
        actionDt: moment.utc().subtract(2, 'day') as unknown as Moment,
      })
      await createTestApiUsage({ actionType: 'download', userId: userContext.user.id })
      await createTestApiUsage({ actionType: 'download', userId: userContext.user.id })
      expect(await canPerformAction(adminContext, 'download')).toBe(true)
    })
  })
})
