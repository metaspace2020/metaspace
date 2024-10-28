import {
  adminContext,
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers, testUser,
  userContext,
} from '../../../tests/graphqlTestEnvironment'

import { getConnection } from 'typeorm'
import { createBackgroundData } from '../../../tests/backgroundDataCreation'
import * as moment from 'moment'

describe('modules/plan/controller (mutations)', () => {
  let userId: string

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    jest.clearAllMocks()
    await onBeforeEach()

    const connection = getConnection()
    await connection.query('ALTER SEQUENCE plan_id_seq RESTART WITH 1')
    await connection.query('ALTER SEQUENCE plan_rule_id_seq RESTART WITH 1')

    await setupTestUsers()
    userId = testUser.id
  })
  afterEach(onAfterEach)

  const planDetails: any = { name: 'regular', isActive: true, createdAt: moment.utc().toISOString() }
  const createPlanMutation = `mutation ($name: String!, $isActive: Boolean!) {
    createPlan(name: $name, isActive: $isActive) { id name isActive createdAt }
  }`

  describe('Mutation.plan', () => {
    it('should create one plan as admin', async() => {
      const result = await doQuery(createPlanMutation, planDetails, { context: adminContext })
      expect(result.name).toEqual(planDetails.name)
      expect(result.isActive).toEqual(planDetails.isActive)
    })

    it('should fail to create one plan as user', async() => {
      await expect(doQuery(createPlanMutation, planDetails,
        { context: userContext })).rejects.toThrow('Unauthorized')
    })

    it('should update a plan as admin', async() => {
      const updatePlanMutation = `mutation ($planId: Int!, $name: String!, $isActive: Boolean!) {
        updatePlan(planId: $planId, name: $name, isActive: $isActive) { id name isActive createdAt }
      }`
      const result = await doQuery(createPlanMutation, planDetails, { context: adminContext })
      const updated = await doQuery(updatePlanMutation,
        { planId: result.id, name: 'updated', isActive: false }, { context: adminContext })

      expect(updated.name).toEqual('updated')
      expect(updated.isActive).toEqual(false)
    })

    it('should fail to update plan as user', async() => {
      const updatePlanMutation = `mutation ($planId: Int!, $name: String!, $isActive: Boolean!) {
        updatePlan(planId: $planId, name: $name, isActive: $isActive) { id name isActive createdAt }
      }`
      const result = await doQuery(createPlanMutation, planDetails, { context: adminContext })

      await expect(doQuery(updatePlanMutation,
        { planId: result.id, name: 'updated', isActive: false },
        { context: userContext })).rejects.toThrow('Unauthorized')

      const allPlans = await doQuery('query { allPlans { id name isActive createdAt } }')
      expect(allPlans[0].name).toEqual(planDetails.name)
      expect(allPlans[0].isActive).toEqual(planDetails.isActive)
    })
  })

  describe('Mutation.planRule', () => {
    const createPlanRuleMutation = `mutation ($planId: Int!, $actionType: String!,
    $period: Int!, $periodType: String!, $limit: Int!) {
      createPlanRule(planId: $planId, actionType: $actionType, period: $period, periodType: $periodType, limit: $limit)
       { id planId actionType period periodType limit createdAt }
    }`

    it('should create a plan rule as admin', async() => {
      const planResult = await doQuery(createPlanMutation, planDetails, { context: adminContext })
      const ruleDetails: any = { planId: planResult.id, actionType: 'download', period: 1, periodType: 'day', limit: 5 }

      const result = await doQuery(createPlanRuleMutation, ruleDetails, { context: adminContext })
      expect(result.planId).toEqual(planResult.id)
    })

    it('should fail to create a plan rule as user', async() => {
      const planResult = await doQuery(createPlanMutation, planDetails, { context: adminContext })
      const ruleDetails: any = { planId: planResult.id, actionType: 'download', period: 1, periodType: 'day', limit: 5 }

      await expect(doQuery(createPlanRuleMutation, ruleDetails,
        { context: userContext })).rejects.toThrow('Unauthorized')
    })

    it('should update a plan rule', async() => {
      const updatePlanRuleMutation = `mutation ($planRuleId: Int!, $actionType: String!,
      $period: Int!, $periodType: String!, $limit: Int!) {
        updatePlanRule(planRuleId: $planRuleId, actionType: $actionType, period: $period,
         periodType: $periodType, limit: $limit)
         { id planId actionType period periodType limit createdAt }
      }`

      const planResult = await doQuery(createPlanMutation, planDetails, { context: adminContext })
      const ruleDetails: any = { planId: planResult.id, actionType: 'download', period: 1, periodType: 'day', limit: 5 }

      const result = await doQuery(createPlanRuleMutation, ruleDetails, { context: adminContext })
      const updated = await doQuery(updatePlanRuleMutation,
        { planRuleId: result.id, ...ruleDetails, limit: 2, actionType: 'upload' },
        { context: adminContext })

      expect(updated.limit).toEqual(2)
      expect(updated.actionType).toEqual('upload')
    })

    it('should delete a plan rule as admin', async() => {
      const deletePlanRuleMutation = 'mutation ($planRuleId: Int!) { deletePlanRule(planRuleId: $planRuleId) }'
      const planResult = await doQuery(createPlanMutation, planDetails, { context: adminContext })
      const ruleDetails: any = { planId: planResult.id, actionType: 'download', period: 1, periodType: 'day', limit: 5 }

      const result = await doQuery(createPlanRuleMutation, ruleDetails, { context: adminContext })
      const deleted = await doQuery(deletePlanRuleMutation, { planRuleId: result.id },
        { context: adminContext })

      expect(deleted).toEqual(true)
    })

    it('should fail to delete plan rule as user', async() => {
      const deletePlanRuleMutation = 'mutation ($planRuleId: Int!) { deletePlanRule(planRuleId: $planRuleId) }'
      const planResult = await doQuery(createPlanMutation, planDetails, { context: adminContext })
      const ruleDetails: any = { planId: planResult.id, actionType: 'download', period: 1, periodType: 'day', limit: 5 }

      const result = await doQuery(createPlanRuleMutation, ruleDetails, { context: adminContext })
      await expect(doQuery(deletePlanRuleMutation, { planRuleId: result.id },
        { context: userContext })).rejects.toThrow('Unauthorized')
    })
  })

  describe('Mutation.ApiUsage', () => {
    it('should create an API usage record', async() => {
      const bgData = await createBackgroundData(
        { users: true, datasets: true, projectsForUserIds: [userId], datasetsForUserIds: [userId] })
      const apiUsageDetails: any = {
        userId,
        datasetId: bgData.datasets[0].id,
        actionType: 'DOWNLOAD',
        type: 'DATASET',
        visibility: 'PUBLIC',
        requestSource: 'API',
      }

      const createApiUsageMutation = `mutation ($userId: String!, $datasetId: String!,
       $actionType: String!, $type: String!, $visibility: String, $requestSource: String) {
        createApiUsage(userId: $userId, datasetId: $datasetId, actionType: $actionType,
        type: $type, visibility: $visibility, requestSource: $requestSource)
         { id userId datasetId actionType type source actionDt }
      }`

      const result = await doQuery(createApiUsageMutation, apiUsageDetails)
      expect(result.userId).toEqual(userId)
    })
  })
})
