import {
  adminContext,
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  userContext,
} from '../../../tests/graphqlTestEnvironment'

import * as moment from 'moment'
import { getConnection } from 'typeorm'

describe('modules/plan/controller (mutations)', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    jest.clearAllMocks()
    await onBeforeEach()
    await setupTestUsers()
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
  })
})
