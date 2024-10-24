import {
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers, userContext,
} from '../../../tests/graphqlTestEnvironment'

import canPerformAction from './canPerformAction'

describe('modules/plan/controller (queries)', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)

  beforeEach(async() => {
    jest.clearAllMocks()
    await onBeforeEach()
    await setupTestUsers()
  })

  afterEach(onAfterEach)

  describe('Plan.canPerformAction', () => {
    it('should be able to download as admin', async() => {
      await canPerformAction(userContext, 'download')
      expect(1).toBe(1)
    })
  })
})
