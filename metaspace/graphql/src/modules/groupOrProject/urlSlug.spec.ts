import { validateUrlSlugChange } from './urlSlug'
import { Project as ProjectModel } from '../project/model'
import {
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  testEntityManager,
} from '../../tests/graphqlTestEnvironment'
import { createTestProject } from '../../tests/testDataCreation'
import { FormValidationErrorsType } from '../../utils/FormValidationErrors'

describe('modules/groupOrProject/urlSlug validateUrlSlugChange', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(onBeforeEach)
  afterEach(onAfterEach)

  const VALID_URL_SLUGS = ['abcdef', 'FOO_bar-baz']
  const INVALID_URL_SLUGS = ['', 'a', 'äbdcëf', 'too_long__too_long__too_long__too_long__too_long__t']
  const EQUIVALENT_SLUG_1 = 'foo_bar_baz'
  const EQUIVALENT_SLUG_2 = 'FOO-BAR-BAZ'

  it.each(VALID_URL_SLUGS)('should successfully validate valid urlSlug', async(urlSlug) => {
    await expect(validateUrlSlugChange(testEntityManager, ProjectModel, null, urlSlug))
      .resolves.toBeUndefined()
  })
  it.each(INVALID_URL_SLUGS)('should throw on invalid urlSlug', async(urlSlug) => {
    await expect(validateUrlSlugChange(testEntityManager, ProjectModel, null, urlSlug))
      .rejects.toThrow(expect.objectContaining({ type: FormValidationErrorsType }))
  })
  it('should prevent duplicate urlSlugs', async() => {
    await createTestProject({ urlSlug: EQUIVALENT_SLUG_1 })
    const testProject2 = await createTestProject({})

    await expect(validateUrlSlugChange(testEntityManager, ProjectModel, testProject2.id, EQUIVALENT_SLUG_2))
      .rejects.toThrow(expect.objectContaining({ type: FormValidationErrorsType }))
  })
  it('should allow a project to be saved its existing urlSlug', async() => {
    const testProject = await createTestProject({ urlSlug: 'foo_bar_baz' })

    await expect(validateUrlSlugChange(testEntityManager, ProjectModel, testProject.id, EQUIVALENT_SLUG_2))
      .resolves.toBeUndefined()
  })
})
