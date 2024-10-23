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

import * as moment from 'moment'
import { getConnection } from 'typeorm'
import { createBackgroundData } from '../../../tests/backgroundDataCreation'

describe('modules/plan/controller (mutations)', () => {
  let userId: string

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    jest.clearAllMocks()
    await onBeforeEach()
    await setupTestUsers()
    userId = testUser.id
    const connection = getConnection()
    await connection.query('ALTER SEQUENCE plan_id_seq RESTART WITH 1') // Reset auto-increment to 1
    await connection.query('ALTER SEQUENCE plan_id_seq RESTART WITH 1') // Reset auto-increment to 1
    await connection.query('ALTER SEQUENCE plan_rule_id_seq RESTART WITH 1') // Reset auto-increment to 1
  })
  afterEach(onAfterEach)

  describe('Mutation.plan', () => {
    it('should create one plan as admin', async() => {
      const planDetails = {
        name: 'regular',
        isActive: true,
        createdAt: moment.utc().toISOString(),

      }
      const createPlan = `mutation ($name: String!, $isActive: Boolean!) {
            createPlan(name: $name, isActive: $isActive) { name isActive createdAt }
        }`

      const result = await doQuery(createPlan, planDetails, { context: adminContext })
      expect(result.name).toEqual(planDetails.name)
      expect(result.isActive).toEqual(planDetails.isActive)
    })
    it('should fail to create one plan as user', async() => {
      const planDetails = {
        name: 'regular',
        isActive: true,
        createdAt: moment.utc().toISOString(),

      }
      const createPlan = `mutation ($name: String!, $isActive: Boolean!) {
            createPlan(name: $name, isActive: $isActive) { name isActive createdAt }
        }`
      try {
        await doQuery(createPlan, planDetails, { context: userContext })
      } catch (e) {
        expect(e.message).toEqual('Unauthorized')
      }
    })
    it('should update plan', async() => {
      const planDetails = {
        name: 'regular',
        isActive: true,
        createdAt: moment.utc().toISOString(),

      }
      const createPlan = `mutation ($name: String!, $isActive: Boolean!) {
            createPlan(name: $name, isActive: $isActive) { id name isActive createdAt }
        }`
      const updatePlan = `mutation ($planId: Int!, $name: String!, $isActive: Boolean!) {
            updatePlan(planId: $planId, name: $name, isActive: $isActive) { id name isActive createdAt }
        }`

      const result = await doQuery(createPlan, planDetails, { context: adminContext })
      expect(result.name).toEqual(planDetails.name)
      expect(result.isActive).toEqual(planDetails.isActive)

      const resultUpdate = await doQuery(updatePlan, {
        planId: result.id,
        name: 'updated',
        isActive: false,
      }, { context: adminContext })

      expect(result.name).not.toEqual(resultUpdate.name)
      expect(resultUpdate.name).toEqual('updated')
      expect(resultUpdate.isActive).toEqual(false)
    })
    it('should fail to update plan as user', async() => {
      const planDetails = {
        name: 'regular',
        isActive: true,

      }
      const createPlan = `mutation ($name: String!, $isActive: Boolean!) {
            createPlan(name: $name, isActive: $isActive) { id name isActive createdAt }
        }`
      const updatePlan = `mutation ($planId: Int!, $name: String!, $isActive: Boolean!) {
            updatePlan(planId: $planId, name: $name, isActive: $isActive) { id name isActive createdAt }
        }`

      const result = await doQuery(createPlan, planDetails, { context: adminContext })
      expect(result.name).toEqual(planDetails.name)
      expect(result.isActive).toEqual(planDetails.isActive)

      try {
        await doQuery(updatePlan, {
          planId: result.id,
          name: 'updated',
          isActive: false,
        }, { context: userContext })
      } catch (e) {
        expect(e.message).toEqual('Unauthorized')
      }

      const searchQuery = `query {
        allPlans { id name isActive createdAt }
      }`
      const resultUpdate = await doQuery(searchQuery)

      expect(result.name).toEqual(resultUpdate[0].name)
      expect(result.isActive).toEqual(resultUpdate[0].isActive)
    })
  })

  describe('Mutation.planRule', () => {
    it('should create one plan rule as admin', async() => {
      const planDetails = {
        name: 'regular',
        isActive: true,

      }
      const createPlan = `mutation ($name: String!, $isActive: Boolean!) {
            createPlan(name: $name, isActive: $isActive) { id name isActive createdAt }
        }`
      const planResult = await doQuery(createPlan, planDetails, { context: adminContext })

      const planRuleDetails = {
        planId: planResult.id,
        actionType: 'download',
        period: 1,
        periodType: 'day',
        limit: 5,
      }
      const createPlanRule = `mutation ($planId: Int!, $actionType: String!, $period: Int!,
       $periodType: String!, $limit: Int!) {
            createPlanRule(planId: $planId, actionType: $actionType, period: $period, 
            periodType: $periodType, limit: $limit)
             { id planId actionType period periodType limit createdAt }
        }`

      const result = await doQuery(createPlanRule, planRuleDetails, { context: adminContext })
      expect(result.planId).toEqual(planResult.id)
    })
    it('should fail to create one plan rule as user', async() => {
      const planDetails = {
        name: 'regular',
        isActive: true,

      }
      const createPlan = `mutation ($name: String!, $isActive: Boolean!) {
            createPlan(name: $name, isActive: $isActive) { id name isActive createdAt }
        }`
      const planResult = await doQuery(createPlan, planDetails, { context: adminContext })

      const planRuleDetails = {
        planId: planResult.id,
        actionType: 'download',
        period: 1,
        periodType: 'day',
        limit: 5,
      }
      const createPlanRule = `mutation ($planId: Int!, $actionType: String!, $period: Int!,
       $periodType: String!, $limit: Int!) {
            createPlanRule(planId: $planId, actionType: $actionType, period: $period, 
            periodType: $periodType, limit: $limit)
             { id planId actionType period periodType limit createdAt }
        }`

      try {
        await doQuery(createPlanRule, planRuleDetails, { context: userContext })
      } catch (e) {
        expect(e.message).toEqual('Unauthorized')
      }
    })
    it('should update plan rule', async() => {
      const planDetails = {
        name: 'regular',
        isActive: true,
        createdAt: moment.utc().toISOString(),

      }
      const createPlan = `mutation ($name: String!, $isActive: Boolean!) {
            createPlan(name: $name, isActive: $isActive) { id name isActive createdAt }
        }`
      const createPlanRule = `mutation ($planId: Int!, $actionType: String!, $period: Int!,
       $periodType: String!, $limit: Int!) {
            createPlanRule(planId: $planId, actionType: $actionType, period: $period, 
            periodType: $periodType, limit: $limit)
             { id planId actionType period periodType limit createdAt }
        }`
      const updatePlanRule = `mutation ($planRuleId: Int!, $actionType: String!, $period: Int!,
         $periodType: String!, $limit: Int!) {
                updatePlanRule(planRuleId: $planRuleId, actionType: $actionType, period: $period, 
                periodType: $periodType, limit: $limit)
                 { id planId actionType period periodType limit createdAt }
          }`

      const planResult = await doQuery(createPlan, planDetails, { context: adminContext })
      const planRuleDetails = {
        planId: planResult.id,
        actionType: 'download',
        period: 1,
        periodType: 'day',
        limit: 5,
      }
      const result = await doQuery(createPlanRule, planRuleDetails, { context: adminContext })

      const resultUpdate = await doQuery(updatePlanRule, {
        planRuleId: result.id,
        ...planRuleDetails,
        limit: 2,
        actionType: 'upload',
      }, { context: adminContext })

      expect(result.limit).not.toEqual(resultUpdate.limit)
      expect(resultUpdate.actionType).toEqual('upload')
    })
    it('should delete plan rule', async() => {
      const planDetails = {
        name: 'regular',
        isActive: true,
        createdAt: moment.utc().toISOString(),

      }
      const createPlan = `mutation ($name: String!, $isActive: Boolean!) {
            createPlan(name: $name, isActive: $isActive) { id name isActive createdAt }
        }`
      const createPlanRule = `mutation ($planId: Int!, $actionType: String!, $period: Int!,
       $periodType: String!, $limit: Int!) {
            createPlanRule(planId: $planId, actionType: $actionType, period: $period, 
            periodType: $periodType, limit: $limit)
             { id planId actionType period periodType limit createdAt }
        }`
      const deletePlanRule = `mutation ($planRuleId: Int!) {
                deletePlanRule(planRuleId: $planRuleId)
          }`

      const planResult = await doQuery(createPlan, planDetails, { context: adminContext })
      const planRuleDetails = {
        planId: planResult.id,
        actionType: 'download',
        period: 1,
        periodType: 'day',
        limit: 5,
      }
      const result = await doQuery(createPlanRule, planRuleDetails, { context: adminContext })

      const resultUpdate = await doQuery(deletePlanRule, {
        planRuleId: result.id,
      }, { context: adminContext })

      expect(resultUpdate).toEqual(true)
    })
    it('should fail to delete plan rule as user', async() => {
      const planDetails = {
        name: 'regular',
        isActive: true,
        createdAt: moment.utc().toISOString(),

      }
      const createPlan = `mutation ($name: String!, $isActive: Boolean!) {
            createPlan(name: $name, isActive: $isActive) { id name isActive createdAt }
        }`
      const createPlanRule = `mutation ($planId: Int!, $actionType: String!, $period: Int!,
       $periodType: String!, $limit: Int!) {
            createPlanRule(planId: $planId, actionType: $actionType, period: $period, 
            periodType: $periodType, limit: $limit)
             { id planId actionType period periodType limit createdAt }
        }`
      const deletePlanRule = `mutation ($planRuleId: Int!) {
                deletePlanRule(planRuleId: $planRuleId)
          }`

      const planResult = await doQuery(createPlan, planDetails, { context: adminContext })
      const planRuleDetails = {
        planId: planResult.id,
        actionType: 'download',
        period: 1,
        periodType: 'day',
        limit: 5,
      }
      const result = await doQuery(createPlanRule, planRuleDetails, { context: adminContext })

      try {
        await doQuery(deletePlanRule, {
          planRuleId: result.id,
        }, { context: userContext })
      } catch (e) {
        expect(e.message).toEqual('Unauthorized')
      }
    })
  })

  describe('Mutation.ApiUsage', () => {
    it('should create one api usage', async() => {
      const bgData = await createBackgroundData({
        users: true,
        datasets: true,
        projectsForUserIds: [userId],
        datasetsForUserIds: [userId],
      })

      const apiUsageDetails = {
        userId: userId,
        datasetId: bgData.datasets[0].id,
        actionType: 'download',
        datasetType: 'public',
        requestSource: 'api',
      }
      const createApiUsage = `mutation ($userId: String!, $datasetId: String!, 
      $actionType: String!, $datasetType: String!, $requestSource: String) {
            createApiUsage(userId: $userId, datasetId: $datasetId, 
      actionType: $actionType, datasetType: $datasetType, requestSource: $requestSource)
       { id userId datasetId actionType datasetType source actionDt }
        }`
      const result = await doQuery(createApiUsage, apiUsageDetails)

      expect(result.userId).toEqual(userId)
    })
  })
})
