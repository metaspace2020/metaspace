import { UserError } from 'graphql-errors'
import { FieldResolversFor } from '../../../bindingTypes'
import { Mutation } from '../../../binding'
import { Context } from '../../../context'
import { assertCanAccessProject } from '../operation/permissions'
import { persistExperiment, ExperimentInput } from '../operation/saveExperiment'
import { Experiment } from '../model'
import { smApiDatasetRequest } from '../../../utils'

function loadFullExperiment(ctx: Context, id: string) {
  return ctx.entityManager.getRepository(Experiment).findOneOrFail({
    where: { id }, relations: ['project', 'datasets', 'datasets.dataset'],
  })
}

async function submitExperimentRun(ctx: Context, exp: Experiment) {
  const repo = ctx.entityManager.getRepository(Experiment)
  const nextGeneration = exp.runGeneration + 1
  await repo.update(exp.id, {
    runStatus: 'QUEUED',
    runStage: 'PREP',
    runError: null,
    runStartedAt: new Date(),
    runFinishedAt: null,
    runGeneration: nextGeneration,
  })
  try {
    await smApiDatasetRequest('/v1/experiment/run', {
      experiment_id: exp.id,
      run_generation: nextGeneration,
    })
  } catch (err) {
    await repo.update(exp.id, {
      runStatus: 'FAILED', runError: String(err.message ?? err),
    })
    throw new UserError('Failed to submit experiment job. See run.error.')
  }
}

async function loadAndAuthorize(ctx: Context, id: string): Promise<Experiment> {
  const exp = await ctx.entityManager.getRepository(Experiment).findOneOrFail(id)
  await assertCanAccessProject(ctx, exp.projectId, { write: true })
  return exp
}

const MutationResolvers: FieldResolversFor<Mutation, any> = {
  createExperiment: async(_, args, ctx: Context) => {
    const projectId: string = args.projectId
    const input = args.input as unknown as ExperimentInput
    await assertCanAccessProject(ctx, projectId, { write: true })
    const id = await ctx.entityManager.transaction(em =>
      persistExperiment(em, ctx, projectId, input))
    return loadFullExperiment(ctx, id) as any
  },
  updateExperiment: async(_, args, ctx: Context) => {
    const id: string = args.id
    const input = args.input as unknown as ExperimentInput
    const exp = await loadAndAuthorize(ctx, id)
    await ctx.entityManager.transaction(em =>
      persistExperiment(em, ctx, exp.projectId, input, id))
    return loadFullExperiment(ctx, id) as any
  },
  deleteExperiment: async(_, args, ctx: Context) => {
    const id: string = args.id
    await loadAndAuthorize(ctx, id)
    await ctx.entityManager.delete(Experiment, id)
    return true
  },
  runExperiment: async(_, args, ctx: Context) => {
    const id: string = args.id
    const exp = await loadAndAuthorize(ctx, id)
    await submitExperimentRun(ctx, exp)
    return loadFullExperiment(ctx, id) as any
  },
  updateExperimentExcludedSamples: async(_, args, ctx: Context) => {
    const experimentId: string = args.experimentId
    const excludedSamples: string[] = args.excludedSamples
    const repo = ctx.entityManager.getRepository(Experiment)
    await loadAndAuthorize(ctx, experimentId)
    await repo.update(experimentId, { runExcludedSamples: excludedSamples })
    const refreshed = await repo.findOneOrFail(experimentId)
    await submitExperimentRun(ctx, refreshed)
    return loadFullExperiment(ctx, experimentId) as any
  },
}

export default MutationResolvers
