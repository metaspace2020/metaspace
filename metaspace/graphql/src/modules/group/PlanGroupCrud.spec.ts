import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach, setupTestUsers, shallowFieldsOfSchemaType,
  testEntityManager,
} from '../../tests/graphqlTestEnvironment'

import {
  createTestPlan,
  createTestPlanRule, createTestUser,
} from '../../tests/testDataCreation'
import { getContextForTest } from '../../getContext'

describe('Project plan checks', () => {
  let originalDateNow: any
  let proPlan: any
  let regularPlan: any
  let testUserReg: any
  let testUserPro: any
  const groupFields = shallowFieldsOfSchemaType('Group')

  // Helpers
  const setMockDate = (dateString: string) => {
    Date.now = jest.fn(() => new Date(dateString).getTime())
  }

  beforeAll(async() => {
    await onBeforeAll()
    originalDateNow = Date.now
    setMockDate('2024-10-30T10:00:00Z')
  })

  afterAll(async() => {
    await onAfterAll()
    Date.now = originalDateNow
  })

  beforeEach(async() => {
    jest.clearAllMocks()
    await onBeforeEach()
    await setupTestUsers()

    regularPlan = await createTestPlan({
      name: 'regular',
      isActive: true,
    })
    proPlan = await createTestPlan({
      name: 'pro',
      isActive: true,
    })

    await createTestPlanRule({
      planId: regularPlan.id,
      actionType: 'create',
      period: 1,
      periodType: 'hour',
      limit: 0,
      type: 'group',
      visibility: 'private',
    })

    await createTestPlanRule({
      planId: regularPlan.id,
      actionType: 'download',
      period: 1,
      periodType: 'day',
      limit: 2,
      type: 'project',
      visibility: 'public',
    })

    await createTestPlanRule({
      planId: proPlan.id,
      actionType: 'create',
      period: 1,
      periodType: 'hour',
      limit: 1,
      type: 'project',
      visibility: 'private',
    })

    testUserReg = await createTestUser({ planId: regularPlan.id })
    testUserPro = await createTestUser({ planId: proPlan.id })
  })

  afterEach(onAfterEach)

  const groupDetails = {
    name: 'foobar',
    shortName: 'foo',
    groupAdminEmail: 'test@mail.com',
  }
  const createGroup = `mutation createGroup($groupDetails: CreateGroupInput!) {
    createGroup(groupDetails: $groupDetails) { ${groupFields} }
  }`

  it('should not be able to create group as a regular', async() => {
    const context = getContextForTest({ ...testUserReg }, testEntityManager)
    await expect(doQuery(createGroup, { groupDetails }, { context })).rejects.toThrow('Limit reached')
  })

  it('should be able to create private group as a pro', async() => {
    const context = getContextForTest({ ...testUserPro }, testEntityManager)
    await expect(doQuery(createGroup, { groupDetails }, { context })).resolves.not.toThrow()
  })
})
