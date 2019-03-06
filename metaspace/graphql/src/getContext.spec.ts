import * as _ from 'lodash';
import {
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers, testEntityManager,
  testUser,
} from './tests/graphqlTestEnvironment';
import {Dataset, DatasetProject} from './modules/dataset/model';
import {Project, UserProject} from './modules/project/model';
import {createTestUser} from './tests/testDataCreation';
import {getContextForTest} from './getContext';
import {MersenneTwister19937, pick} from 'random-js';


describe('getContext', () => {
  let userId: string;
  beforeAll(onBeforeAll);
  afterAll(onAfterAll);
  beforeEach(async () => {
    await onBeforeEach();
    await setupTestUsers();
    userId = testUser.id;
  });
  afterEach(onAfterEach);
  describe('cachedGetEntityById', () => {
    const testIds = [1,2,3].map(n => `00000000-1234-0000-0000-00000000000${n}`);
    const [id1, id2, id3] = testIds;
    const testIdPairs = [[id1, id1], [id1, id2], [id1, id3], [id2, id1], [id2, id2]];
    const testDatasetProjectIds = testIdPairs.map(([idA, idB]) => ({datasetId: idA, projectId: idB}));
    const testUserProjectIds = testIdPairs.map(([idA, idB]) => ({userId: idA, projectId: idB}));
    const missingId = '11111111-2222-3333-4444-555555555555';

    beforeEach(async () => {
      // testIds are shared between different tables intentionally to ensure that cachedGetEntityById is correctly
      // isolating between entity types. A mix of both single-primary-key and composite-primary-key tables is included.
      await testEntityManager.insert(Dataset, testIds.map(id => ({id, userId, piName: id})));
      await testEntityManager.insert(Project, testIds.map(id => ({id, name: id})));
      await Promise.all(testIds.map(id => createTestUser({id: id, name: id})));
      await testEntityManager.insert(DatasetProject, testDatasetProjectIds.map(id => ({...id, approved: true})));
      await testEntityManager.insert(UserProject, testUserProjectIds.map(id => ({...id, role: 'MEMBER' as 'MEMBER'})));
    });

    // [EntityType, id, expected value]
    const testQueries = [
      ...testIds.map(id => [Dataset, id, expect.objectContaining({id, piName: id})]),
      ...testIds.map(id => [Project, id, expect.objectContaining({id, name: id})]),
      ...testDatasetProjectIds.map(id => [DatasetProject, id, expect.objectContaining(id)]),
      ...testUserProjectIds.map(id => [UserProject, id, expect.objectContaining(id)]),
      [Dataset, missingId, null],
      [Project, missingId, null],
      [DatasetProject, {datasetId: missingId, projectId: id1}, null],
      [DatasetProject, {datasetId: id1, projectId: missingId}, null],
      [UserProject, {userId: missingId, projectId: id1}, null],
      [UserProject, {userId: id1, projectId: missingId}, null],
    ];

    _.range(5).forEach((seed) => {
      it(`should fetch correct results for random overlapping batches of queries (seed: ${seed})`, async () => {
        const context = getContextForTest(null, testEntityManager);
        const rand = MersenneTwister19937.seed(seed);
        const batch1 = _.range(10).map(() => pick(rand, testQueries));
        const batch2 = _.range(10).map(() => pick(rand, testQueries));

        const results1 = await Promise.all(batch1.map(([entity, id]) => context.cachedGetEntityById(entity, id)));
        const results2 = await Promise.all(batch2.map(([entity, id]) => context.cachedGetEntityById(entity, id)));

        expect(results1).toEqual(batch1.map(([,,expected]) => expected));
        expect(results2).toEqual(batch2.map(([,,expected]) => expected));
      });
    });

    it(`should share results between simultaneous queries within the same context`, async () => {
      const context = getContextForTest(null, testEntityManager);

      const [results1, results2] = await Promise.all([
        Promise.all(testQueries.map(([entity, id]) => context.cachedGetEntityById(entity, id))),
        Promise.all(testQueries.map(([entity, id]) => context.cachedGetEntityById(entity, id))),
      ]);

      results1.forEach((result, i) => {
        expect(result).toBe(results2[i])
      });
    });

    it(`should not share results for simultaneous queries between different contexts`, async () => {
      const context1 = getContextForTest(null, testEntityManager);
      const context2 = getContextForTest(null, testEntityManager);


      const [results1, results2] = await Promise.all([
        Promise.all(testQueries.map(([entity, id]) => context1.cachedGetEntityById(entity, id))),
        Promise.all(testQueries.map(([entity, id]) => context2.cachedGetEntityById(entity, id))),
      ]);

      results1.forEach((result, i) => {
        if (result != null) {
          expect(result).not.toBe(results2[i]);
        }
      });
    });

    it(`should share results between subsequent queries within the same context`, async () => {
      const context = getContextForTest(null, testEntityManager);

      const results1 = await Promise.all(testQueries.map(([entity, id]) => context.cachedGetEntityById(entity, id)));
      const results2 = await Promise.all(testQueries.map(([entity, id]) => context.cachedGetEntityById(entity, id)));

      results1.forEach((result, i) => {
        expect(result).toBe(results2[i])
      });
    });

    it(`should not share results between subsequent queries between different contexts`, async () => {
      const context1 = getContextForTest(null, testEntityManager);
      const context2 = getContextForTest(null, testEntityManager);

      const results1 = await Promise.all(testQueries.map(([entity, id]) => context1.cachedGetEntityById(entity, id)));
      const results2 = await Promise.all(testQueries.map(([entity, id]) => context2.cachedGetEntityById(entity, id)));

      results1.forEach((result, i) => {
        if (result != null) {
          expect(result).not.toBe(results2[i]);
        }
      });
    });
  })
});
