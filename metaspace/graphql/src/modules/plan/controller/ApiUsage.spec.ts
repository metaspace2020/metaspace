import {
  createTestApiUsage,
  createTestDataset,
  createTestProject,
  createTestGroup,
} from '../../../tests/testDataCreation'
import {
  adminContext,
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testUser,
} from '../../../tests/graphqlTestEnvironment'
import * as moment from 'moment'

describe('modules/plan/controller (api usage)', () => {
  const currentTime: any = moment.utc(moment.utc().toDate())
  let createdApiUsages: any = []

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)

  beforeEach(async() => {
    jest.clearAllMocks()
    await onBeforeEach()
    await setupTestUsers()
    const dataset = await createTestDataset()
    const project = await createTestProject()
    const group = await createTestGroup()

    createdApiUsages = await Promise.all([
      createTestApiUsage({
        datasetId: dataset.id,
        projectId: project.id,
        groupId: group.id,
        userId: testUser.id,
        actionType: 'download',
        type: 'dataset',
        source: 'web',
        canEdit: true,
        actionDt: currentTime,
      }),
      createTestApiUsage({
        datasetId: dataset.id,
        projectId: project.id,
        groupId: group.id,
        userId: testUser.id,
        actionType: 'update',
        type: 'project',
        source: 'api',
        canEdit: false,
        actionDt: currentTime,
      }),
      createTestApiUsage({
        datasetId: dataset.id,
        projectId: project.id,
        groupId: group.id,
        userId: testUser.id,
        actionType: 'download',
        type: 'dataset',
        source: 'web',
        canEdit: true,
        actionDt: currentTime,
      }),
    ])
  })

  afterEach(onAfterEach)

  describe('Query.allApiUsages', () => {
    const queryAllApiUsages = `query ($filter: ApiUsageFilter, $orderBy: ApiUsageOrderBy, $sortingOrder: SortingOrder, $offset: Int, $limit: Int) {
      allApiUsages(filter: $filter, orderBy: $orderBy, sortingOrder: $sortingOrder, offset: $offset, limit: $limit) {
        id
        userId
        datasetId
        projectId
        groupId
        actionType
        type
        source
        canEdit
        actionDt
      }
    }`

    it('should require admin access', async() => {
      await expect(doQuery(queryAllApiUsages)).rejects.toThrow('Access denied')
    })

    it('should return all api usages by default', async() => {
      const result = await doQuery(queryAllApiUsages, undefined, { context: adminContext })
      expect(result.length).toEqual(createdApiUsages.length)
    })

    it('should filter by actionType', async() => {
      const result = await doQuery(queryAllApiUsages, {
        filter: { actionType: 'download' },
      }, { context: adminContext })
      expect(result.length).toEqual(2)
    })

    it('should filter by type', async() => {
      const result = await doQuery(queryAllApiUsages, {
        filter: { type: 'dataset' },
      }, { context: adminContext })
      expect(result.length).toEqual(2)
    })

    it('should filter by source', async() => {
      const result = await doQuery(queryAllApiUsages, {
        filter: { source: 'web' },
      }, { context: adminContext })
      expect(result.length).toEqual(2)
    })

    it('should filter by date range', async() => {
      const beforeDate = moment.utc(currentTime).subtract(1, 'day')
      const afterDate = moment.utc(currentTime).add(1, 'day')

      // Should return all records when date range includes current time
      const resultWithin = await doQuery(queryAllApiUsages, {
        filter: {
          startDate: beforeDate.toISOString(),
          endDate: afterDate.toISOString(),
        },
      }, { context: adminContext })
      expect(resultWithin.length).toEqual(3)

      // Should return no records when date range is before current time
      const resultBefore = await doQuery(queryAllApiUsages, {
        filter: {
          startDate: beforeDate.subtract(2, 'days').toISOString(),
          endDate: beforeDate.toISOString(),
        },
      }, { context: adminContext })
      expect(resultBefore.length).toEqual(0)

      // Should return no records when date range is after current time
      const resultAfter = await doQuery(queryAllApiUsages, {
        filter: {
          startDate: afterDate.toISOString(),
          endDate: afterDate.add(2, 'days').toISOString(),
        },
      }, { context: adminContext })
      expect(resultAfter.length).toEqual(0)
    })

    it('should sort by date', async() => {
      const result = await doQuery(queryAllApiUsages, {
        orderBy: 'ORDER_BY_DATE',
        sortingOrder: 'DESCENDING',
      }, { context: adminContext })
      expect(result.length).toEqual(3)
      expect(result[0].actionDt).toEqual(currentTime.valueOf().toString())
    })

    it('should paginate results', async() => {
      const result = await doQuery(queryAllApiUsages, {
        offset: 1,
        limit: 1,
      }, { context: adminContext })
      expect(result.length).toEqual(1)
    })
  })

  describe('Query.apiUsagesCount', () => {
    const queryApiUsagesCount = `query ($filter: ApiUsageFilter) {
      apiUsagesCount(filter: $filter)
    }`

    it('should require admin access', async() => {
      await expect(doQuery(queryApiUsagesCount)).rejects.toThrow('Access denied')
    })

    it('should return total count', async() => {
      const result = await doQuery(queryApiUsagesCount, undefined, { context: adminContext })
      expect(result).toEqual(createdApiUsages.length)
    })

    it('should return filtered count', async() => {
      const result = await doQuery(queryApiUsagesCount, {
        filter: { actionType: 'download' },
      }, { context: adminContext })
      expect(result).toEqual(2)
    })

    it('should return filtered count with date range', async() => {
      const beforeDate = moment.utc(currentTime).subtract(1, 'day')
      const afterDate = moment.utc(currentTime).add(1, 'day')

      // Should count all records when date range includes current time
      const countWithin = await doQuery(queryApiUsagesCount, {
        filter: {
          startDate: beforeDate.toISOString(),
          endDate: afterDate.toISOString(),
        },
      }, { context: adminContext })
      expect(countWithin).toEqual(3)

      // Should count no records when date range is before current time
      const countBefore = await doQuery(queryApiUsagesCount, {
        filter: {
          startDate: beforeDate.subtract(2, 'days').toISOString(),
          endDate: beforeDate.toISOString(),
        },
      }, { context: adminContext })
      expect(countBefore).toEqual(0)
    })
  })
})
