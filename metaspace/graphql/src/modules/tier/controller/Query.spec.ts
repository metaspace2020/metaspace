import {
  createTestTier,
} from '../../../tests/testDataCreation'
import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  shallowFieldsOfSchemaType,
  testUser, userContext,
} from '../../../tests/graphqlTestEnvironment'

describe('modules/tier/controller (queries)', () => {
  const tierFields = shallowFieldsOfSchemaType('Tier')
  let userId: string

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    userId = testUser.id
  })
  afterEach(onAfterEach)

  describe('Query.tier', () => {
    describe('should return all public projects', async () => {
      const searchQuery = `query {
        allTiers { ${tierFields} }
      }`

      const tier = await createTestTier({ name: 'test tier' })
      const result = await doQuery(searchQuery, {}, { context: userContext })

      expect(result).toEqual([
        expect.objectContaining({
          id: tier.id,
          name: tier.name,
          isActive: tier.isActive,
          createdDT: tier.createdAt.toISOString(),
        }),
      ])
    })
  })
})
