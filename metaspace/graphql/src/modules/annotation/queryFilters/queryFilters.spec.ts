import * as _ from 'lodash'
import {
  anonContext,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  testEntityManager,
} from '../../../tests/graphqlTestEnvironment'
import { ColocAnnotation, ColocJob, Ion } from '../model'
import { applyQueryFilters, ESAnnotationWithColoc } from './index'
import { ESAnnotation } from '../../../../esConnector'
import { DeepPartial } from 'typeorm'

import { QueryFilterArgs } from './types'
import * as moment from 'moment'
import { MolecularDB } from '../../moldb/model'
import { createTestMolecularDB } from '../../../tests/testDataCreation'

describe('annotation/queryFilters applyQueryFilters (colocalization)', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  // beforeEach(onBeforeEach);
  afterEach(onAfterEach)

  let ions: Ion[]
  let job: ColocJob
  let database: MolecularDB

  beforeEach(async() => {
    await onBeforeEach()

    ions = testEntityManager.create(Ion, [1, 2, 3, 4].map(i => ({
      ion: `H${i}O+H+`,
      formula: `H${i}O`,
      chemMod: i & 1 ? '-H+OH' : '',
      neutralLoss: i & 2 ? '-OH' : '',
      adduct: '+H',
      charge: 1,
    })))
    await testEntityManager.insert(Ion, ions)

    database = await createTestMolecularDB({ name: 'HMDB-v4', version: 'version' })

    job = testEntityManager.create(ColocJob, {
      datasetId: 'datasetId',
      moldbId: database.id,
      fdr: 0.1,
      algorithm: 'cosine',
      sampleIonIds: [ions[1].id, ions[2].id],
      start: moment(),
      finish: moment(),
    })
    await testEntityManager.insert(ColocJob, job)

    const annotations = testEntityManager.create(ColocAnnotation, _.range(ions.length).map(i => ({
      colocJobId: job.id,
      ionId: ions[i].id,
      colocIonIds: [...ions, ...ions].slice(i + 1, i + 3).map(ion => ion.id),
      colocCoeffs: [0.9, 0.7],
    })))
    await testEntityManager.insert(ColocAnnotation, annotations)
  })

  it('should transform the args of a request with a colocalizedWith filter', async() => {
    const argsWithColocWith: QueryFilterArgs = {
      datasetFilter: { ids: job.datasetId },
      filter: {
        databaseId: job.moldbId,
        fdrLevel: job.fdr,
        colocalizedWith: ions[1].ion,
        colocalizationAlgo: job.algorithm,
      },
    }

    const { args } = await applyQueryFilters(anonContext, argsWithColocWith)

    expect(args).toMatchObject({
      offset: 0,
      limit: 1000,
      filter: {
        databaseId: database.id,
        ion: ions.slice(1, 4).map(ion => ion.ion),
      } as any,
    })
    args.filter!.databaseId = 1
    expect(args).toMatchSnapshot()
  })

  it('should transform the args of a request with a colocalizationSamples filter', async() => {
    const argsWithColocWith: QueryFilterArgs = {
      datasetFilter: { ids: job.datasetId },
      filter: {
        databaseId: job.moldbId,
        fdrLevel: job.fdr,
        colocalizationSamples: true,
        colocalizationAlgo: job.algorithm,
      },
    }

    const { args } = await applyQueryFilters(anonContext, argsWithColocWith)

    expect(args).toMatchObject({
      filter: {
        databaseId: database.id,
        ion: ions.slice(1, 3).map(ion => ion.ion),
      } as any,
    })
    args.filter!.databaseId = 1
    expect(args).toMatchSnapshot()
  })

  it('should add colocalizationCoeffs to annotations', async() => {
    const argsWithColocWith: QueryFilterArgs = {
      datasetFilter: { ids: job.datasetId },
      filter: {
        databaseId: job.moldbId,
        fdrLevel: job.fdr,
        colocalizedWith: ions[1].ion,
        colocalizationAlgo: job.algorithm,
      },
    }
    const ionAnnotations = ions.map(({ ion, formula, chemMod, neutralLoss, adduct }) =>
      ({ ion, formula, chem_mod: chemMod, neutral_loss: neutralLoss, adduct }))
    const { postprocess } = await applyQueryFilters(anonContext, argsWithColocWith)
    const annotations: DeepPartial<ESAnnotation>[] = [
      { _source: ionAnnotations[2] },
      { _source: ionAnnotations[3] },
      { _source: ionAnnotations[1] },
    ]

    const result = postprocess!(annotations as ESAnnotation[]) as ESAnnotationWithColoc[]

    expect(result).toMatchObject([
      { _source: ionAnnotations[1], _isColocReference: true },
      { _source: ionAnnotations[2], _isColocReference: false },
      { _source: ionAnnotations[3], _isColocReference: false },
    ])
    expect(result[0].getColocalizationCoeff(ions[1].ion, job.algorithm, job.moldbId, job.fdr)).toEqual(1)
    expect(result[1].getColocalizationCoeff(ions[1].ion, job.algorithm, job.moldbId, job.fdr)).toEqual(0.9)
    expect(result[2].getColocalizationCoeff(ions[1].ion, job.algorithm, job.moldbId, job.fdr)).toEqual(0.7)
  })
})
