import {
  createTestGroup,
  createTestUserGroup,
  createTestMolecularDB,
} from '../../tests/testDataCreation'
import {
  adminContext,
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach, setupTestUsers,
  testUser,
  userContext,
} from '../../tests/graphqlTestEnvironment'
import { Group, UserGroupRoleOptions as UGRO } from '../group/model'
import config from '../../utils/config'

import * as smApiDatabases from '../../utils/smApi/databases'
jest.mock('../../utils/smApi/databases')
const mockSmApiDatabases = smApiDatabases as jest.Mocked<typeof smApiDatabases>

jest.mock('./util/assertImportFileIsValid')

const allMolecularDBs = `
    query allMolecularDBs($filter: MolecularDBFilter) {
      allMolecularDBs(filter: $filter) {
        id name fullName default isPublic archived targeted description link citation group
        { id shortName }
      }
    }`

describe('Molecular databases queries: permissions', () => {
  let group: Group

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    group = await createTestGroup()
  })
  afterEach(onAfterEach)

  test('Databases are sorted by name', async() => {
    await setupTestUsers([group.id])
    await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)
    await createTestMolecularDB({ name: 'xyz', groupId: group.id })
    await createTestMolecularDB({ name: 'abc', groupId: group.id })

    const result = await doQuery(allMolecularDBs, {})

    expect(result[0]).toMatchObject({ name: 'abc' })
    expect(result[1]).toMatchObject({ name: 'xyz' })
  })

  test('Group members can see group databases', async() => {
    await setupTestUsers([group.id])
    await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)
    const { id } = await createTestMolecularDB({ groupId: group.id })

    const result = await doQuery(allMolecularDBs, {}, { context: userContext })

    expect(result).toEqual([
      expect.objectContaining({ id, group: { id: group.id, shortName: group.shortName } }),
    ])
  })

  test('Group members can use group databases', async() => {
    await setupTestUsers([group.id])
    await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)
    const { id } = await createTestMolecularDB({ groupId: group.id })

    const result = await doQuery(allMolecularDBs, { filter: { usable: true } }, { context: userContext })

    expect(result).toEqual([
      expect.objectContaining({ id, group: { id: group.id, shortName: group.shortName } }),
    ])
  })

  test('Non-group members can only see public group databases', async() => {
    await setupTestUsers()
    await createTestMolecularDB({ isPublic: false, groupId: (await createTestGroup()).id })
    const { id: pubGroupId } = await createTestMolecularDB({ isPublic: true, groupId: group.id })

    const result = await doQuery(allMolecularDBs, {}, { context: userContext })

    expect(result).toEqual([expect.objectContaining({ id: pubGroupId })])
  })

  test('Non-group members cannot use public group databases', async() => {
    await setupTestUsers()
    await createTestMolecularDB({ isPublic: false, groupId: (await createTestGroup()).id })
    await createTestMolecularDB({ isPublic: true, groupId: (await createTestGroup()).id })

    const result = await doQuery(allMolecularDBs, { filter: { usable: true } }, { context: userContext })

    expect(result).toEqual([])
  })

  test('Admins can see all group databases', async() => {
    await setupTestUsers()
    const { id } = await createTestMolecularDB({ groupId: group.id })

    const result = await doQuery(allMolecularDBs, {}, { context: adminContext })

    expect(result).toEqual([
      expect.objectContaining({ id, group: { id: group.id, shortName: group.shortName } }),
    ])
  })

  test('Admins can use all group databases', async() => {
    await setupTestUsers()
    const { id } = await createTestMolecularDB({ groupId: group.id })

    const result = await doQuery(allMolecularDBs, { filter: { usable: true } }, { context: adminContext })

    expect(result).toEqual([
      expect.objectContaining({ id, group: { id: group.id, shortName: group.shortName } }),
    ])
  })
})

describe('Molecular databases queries: filters', () => {
  let group: Group

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    group = await createTestGroup()
    await setupTestUsers([group.id])
    await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)
    // Usable, non-global
    await createTestMolecularDB({ name: 'test-db-1', archived: false, isPublic: true, groupId: group.id })
    // Usable, global
    await createTestMolecularDB({ name: 'test-db-2', archived: false, isPublic: true, groupId: null })
    // Unusable, non-global
    await createTestMolecularDB({ name: 'test-db-3', archived: true, isPublic: true, groupId: group.id })
    // Unusable, global
    await createTestMolecularDB({ name: 'test-db-4', archived: true, isPublic: true, groupId: null })
  })
  afterEach(onAfterEach)

  test('Find all databases', async() => {
    const result = await doQuery(allMolecularDBs, {}, { context: userContext })

    expect(result.length).toEqual(4)
  })

  test('Find usable databases', async() => {
    const result = await doQuery(allMolecularDBs, { filter: { usable: true } }, { context: userContext })

    expect(result).toEqual([
      expect.objectContaining({ archived: false }),
      expect.objectContaining({ archived: false }),
    ])
  })

  test('Find global databases', async() => {
    const result = await doQuery(allMolecularDBs, { filter: { global: true } }, { context: userContext })

    expect(result).toEqual([
      expect.objectContaining({ group: null }),
      expect.objectContaining({ group: null }),
    ])
  })

  test('Find usable global databases', async() => {
    const result = await doQuery(
      allMolecularDBs, { filter: { usable: true, global: true } }, { context: userContext }
    )

    expect(result).toEqual([
      expect.objectContaining({ archived: false, group: null }),
    ])
  })
})

describe('Molecular database mutation permissions', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
  })
  afterEach(onAfterEach)

  describe('createMolecularDB mutation', () => {
    const createMolecularDB = `mutation($groupId: ID!) {
      createMolecularDB(databaseDetails: {
        name: "test-db"
        version: "v1"
        isPublic: true
        filePath: "s3://${config.upload.bucket}/${config.upload.moldb_prefix}/abc"
        groupId: $groupId
      }) {
        id name version
      }
    }`

    test('Group members can create database', async() => {
      const group = await createTestGroup()
      await setupTestUsers([group.id])
      await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)

      mockSmApiDatabases.smApiCreateDatabase.mockImplementation(async() => {
        return await createTestMolecularDB({ groupId: group.id })
      })

      await doQuery(createMolecularDB, { groupId: group.id }, { context: userContext })
    })

    test('Non-group members cannot create database', async() => {
      const group = await createTestGroup()
      await setupTestUsers([group.id])
      await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)

      const randomGroupId = '123e4567-e89b-12d3-a456-426655440000'
      const promise = doQuery(createMolecularDB, { groupId: randomGroupId }, { context: userContext })

      await expect(promise).rejects.toThrowError(/Unauthorized/)
    })

    test('Admins can create database', async() => {
      const randomGroup = await createTestGroup()
      await setupTestUsers()

      mockSmApiDatabases.smApiCreateDatabase.mockImplementation(async() => {
        return await createTestMolecularDB({ groupId: randomGroup.id })
      })

      await doQuery(createMolecularDB, { groupId: randomGroup.id }, { context: adminContext })
    })
  })

  describe('updateMolecularDB mutation', () => {
    const updateMolecularDB = `mutation($id: Int!) {
      updateMolecularDB(databaseId: $id, databaseDetails: {
        fullName: "Test database name"
        archived: true
      }) {
        id name version
      }
    }`

    test('Group members can update database', async() => {
      const group = await createTestGroup()
      await setupTestUsers([group.id])
      await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)
      const { id } = await createTestMolecularDB({ groupId: group.id })

      mockSmApiDatabases.smApiUpdateDatabase.mockImplementation(() => {
        return { id }
      })

      await doQuery(updateMolecularDB, { id }, { context: userContext })
    })

    test('Non-group members cannot update database', async() => {
      const group = await createTestGroup()
      await setupTestUsers([group.id])
      await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)

      const randomGroup = await createTestGroup({ id: '123e4567-e89b-12d3-a456-426655440000' })
      const { id } = await createTestMolecularDB({ groupId: randomGroup.id })

      const promise = doQuery(updateMolecularDB, { id }, { context: userContext })
      await expect(promise).rejects.toThrowError(/Unauthorized/)
    })

    test('Admins can update database', async() => {
      await setupTestUsers()
      const randomGroup = await createTestGroup()
      const { id } = await createTestMolecularDB({ groupId: randomGroup.id })

      mockSmApiDatabases.smApiUpdateDatabase.mockImplementation(() => {
        return { id }
      })

      await doQuery(updateMolecularDB, { id }, { context: adminContext })
    })
  })

  describe('deleteMolecularDB mutation', () => {
    const deleteMolecularDB = `mutation($id: Int!) {
      deleteMolecularDB(databaseId: $id)
    }`

    test('Group members can delete database', async() => {
      const group = await createTestGroup()
      await setupTestUsers([group.id])
      await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)
      const { id } = await createTestMolecularDB({ groupId: group.id })

      await doQuery(deleteMolecularDB, { id }, { context: userContext })
    })

    test('Admins can delete database', async() => {
      await setupTestUsers()
      const group = await createTestGroup()
      const { id } = await createTestMolecularDB({ groupId: group.id })

      await doQuery(deleteMolecularDB, { id }, { context: adminContext })
    })
  })
})
