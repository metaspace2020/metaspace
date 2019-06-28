import * as _ from 'lodash';
import {
  anonContext,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  testEntityManager,
} from '../../tests/graphqlTestEnvironment';
import {ColocAnnotation, ColocJob, Ion} from './model';
import {ArgsFromBinding} from '../../bindingTypes';
import {Query} from '../../binding';
import {applyQueryFilters} from './queryFilters';
import {ESAnnotation} from '../../../esConnector';
import {DeepPartial} from 'typeorm';

type Args = ArgsFromBinding<Query['allAnnotations']>
  | ArgsFromBinding<Query['countAnnotations']>;

describe('annotation/queryFilters applyQueryFilters', () => {
  beforeAll(onBeforeAll);
  afterAll(onAfterAll);
  // beforeEach(onBeforeEach);
  afterEach(onAfterEach);

  let ions: Ion[];
  let job: ColocJob;

  beforeEach(async () => {
    await onBeforeEach();

    ions = testEntityManager.create(Ion, [1,2,3,4].map(i => ({
      ion: `H${i}O+H+`,
      formula: `H${i}O`,
      adduct: '+H',
      charge: 1
    })));
    await testEntityManager.insert(Ion, ions);

    job = testEntityManager.create(ColocJob, {
      datasetId: 'datasetId',
      molDb: 'HMDB-v4',
      fdr: 0.1,
      algorithm: 'cosine',
      sampleIonIds: [ions[1].id, ions[2].id],
    });
    const res = await testEntityManager.insert(ColocJob, job);

    const annotations = testEntityManager.create(ColocAnnotation, _.range(ions.length).map(i => ({
      colocJobId: job.id,
      ionId: ions[i].id,
      colocIonIds: [...ions, ...ions].slice(i+1, i+3).map(ion => ion.id),
      colocCoeffs: [0.9, 0.7],
    })));
    await testEntityManager.insert(ColocAnnotation, annotations);
  });

  it('should transform the args of a request with a colocalizedWith filter', async () => {
    const argsWithColocWith: Args = {
      datasetFilter: { ids: job.datasetId },
      filter: {
        database: job.molDb!,
        fdrLevel: job.fdr,
        colocalizedWith: ions[1].ion,
        colocalizationAlgo: job.algorithm,
      }
    };

    const {args, postprocess} = await applyQueryFilters(anonContext, argsWithColocWith);

    expect(args).toMatchSnapshot();
    expect(args).toMatchObject({
      offset: 0,
      limit: 1000,
      filter: {
        ion: ions.slice(1,4).map(ion => ion.ion),
      }
    });
  });

  it('should transform the args of a request with a colocalizationSamples filter', async () => {
    const argsWithColocWith: Args = {
      datasetFilter: { ids: job.datasetId },
      filter: {
        database: job.molDb!,
        fdrLevel: job.fdr,
        colocalizationSamples: true,
        colocalizationAlgo: job.algorithm,
      }
    };

    const {args, postprocess} = await applyQueryFilters(anonContext, argsWithColocWith);

    expect(args).toMatchSnapshot();
    expect(args).toMatchObject({
      filter: {
        ion: ions.slice(1,3).map(ion => ion.ion)
      }
    });
  });

  it('should add colocalizationCoeffs to annotations', async () => {
    const argsWithColocWith: Args = {
      datasetFilter: { ids: job.datasetId },
      filter: {
        database: job.molDb!,
        fdrLevel: job.fdr,
        colocalizedWith: ions[1].ion,
        colocalizationAlgo: job.algorithm,
      }
    };
    const {args, postprocess} = await applyQueryFilters(anonContext, argsWithColocWith);
    const annotations: DeepPartial<ESAnnotation>[] = [
      {_source: {ion: ions[2].ion}},
      {_source: {ion: ions[3].ion}},
      {_source: {ion: ions[1].ion}},
    ];

    const result = postprocess!(annotations as ESAnnotation[]);

    expect(result).toMatchObject([
      {_source: {ion: ions[1].ion}, _isColocReference: true},
      {_source: {ion: ions[2].ion}, _isColocReference: false},
      {_source: {ion: ions[3].ion}, _isColocReference: false},
    ]);
    expect(await result[0].getColocalizationCoeff(ions[1].ion, job.algorithm, job.molDb!, job.fdr)).toEqual(1);
    expect(await result[1].getColocalizationCoeff(ions[1].ion, job.algorithm, job.molDb!, job.fdr)).toEqual(0.9);
    expect(await result[2].getColocalizationCoeff(ions[1].ion, job.algorithm, job.molDb!, job.fdr)).toEqual(0.7);
  });
});
