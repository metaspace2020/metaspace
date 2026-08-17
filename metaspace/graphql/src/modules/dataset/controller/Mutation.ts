import * as jsondiffpatch from 'jsondiffpatch'
import logger from '../../../utils/logger'
import * as Ajv from 'ajv'
import { UserError } from 'graphql-errors'
import { Brackets, EntityManager } from 'typeorm'
import * as moment from 'moment'
import * as _ from 'lodash'
import * as uuid from 'uuid'

import { smApiDatasetRequest } from '../../../utils'
import {
  Project as ProjectModel,
  UserProject as UserProjectModel,
  UserProjectRoleOptions as UPRO,
} from '../../project/model'
import { PublicationStatusOptions as PSO } from '../../project/Publishing'
import { Dataset as DatasetModel, DatasetProject as DatasetProjectModel } from '../model'
import { DatasetCreateInput, DatasetUpdateInput, Int, Mutation } from '../../../binding'
import { Context, ContextUser } from '../../../context'
import { FieldResolversFor } from '../../../bindingTypes'
import { getUserProjectRoles } from '../../../utils/db'
import { metadataSchemas } from '../../../../metadataSchemas/metadataRegistry'
import { getDatasetForEditing } from '../operation/getDatasetForEditing'
import { deleteDataset } from '../operation/deleteDataset'
import { checkNoPublishedProjectRemoved, checkProjectsPublicationStatus } from '../operation/publicationChecks'
import {
  EngineDataset,
  ScoringModel,
  Roi,
  DiffRoi,
  Segmentation,
  ImageSegmentationJob,
  DatasetDiagnostic,
  DiagnosticTypeOptions,
  DatasetSplitJob,
  DatasetSplitChild,
} from '../../engine/model'
import {
  MIN_ROI_PIXELS,
  assertCanSplitDataset,
  fetchRoiSplitStats,
  generateChildDatasetIds,
} from '../operation/datasetSplit'
import { addExternalLink, removeExternalLink } from '../../project/ExternalLink'
import { esDatasetByID } from '../../../../esConnector'
import { mapDatabaseToDatabaseId } from '../../moldb/util/mapDatabaseToDatabaseId'
import { MolecularDbRepository } from '../../moldb/MolecularDbRepository'
import { assertUserBelongsToGroup } from '../../moldb/util/assertUserBelongsToGroup'
import { smApiUpdateDataset } from '../../../utils/smApi/datasets'
import { validateTiptapJson } from '../../../utils/tiptap'
import { isMemberOfGroup } from '../operation/isMemberOfGroup'
import { DatasetEnrichment as DatasetEnrichmentModel } from '../../enrichmentdb/model'
import { getS3Client } from '../../../utils/awsClient'
import config from '../../../utils/config'
import { assertCanPerformAction, getDeviceInfo, hashIp, performAction } from '../../plan/util/canPerformAction'
import { cleanEmptyStrings } from '../../../utils/regexSanitizer'
import canEditEsDataset from '../operation/canEditEsDataset'

type MetadataSchema = any;
type MetadataRoot = any;
type MetadataNode = any;

function isEmpty(obj: any) {
  if (!obj) {
    return true
  }
  if (!(obj instanceof Object)) {
    return false
  }
  let empty = true
  for (const key in obj) {
    if (!isEmpty(obj[key])) {
      empty = false
      break
    }
  }
  return empty
}

function trimEmptyFields(schema: MetadataSchema, value: MetadataNode) {
  if (!(value instanceof Object)) {
    return value
  }
  if (Array.isArray(value)) {
    return value
  }
  const obj = Object.assign({}, value)
  for (const name in schema.properties) {
    const prop = schema.properties[name]
    if (isEmpty(obj[name]) && (!schema.required || schema.required.indexOf(name) === -1)) {
      delete obj[name]
    } else {
      obj[name] = trimEmptyFields(prop, obj[name])
    }
  }
  return obj
}

function validateMetadata(metadata: MetadataNode) {
  const ajv = new Ajv({ allErrors: true })
  const mdSchema = metadataSchemas[metadata.Data_Type]
  const validator = ajv.compile(mdSchema)
  const cleanValue = trimEmptyFields(mdSchema, metadata)
  /* eslint-disable-next-line @typescript-eslint/no-floating-promises */ // ajv is only async when the schema has $async nodes
  validator(cleanValue)
  const validationErrors = validator.errors || []

  // Validate MS_Analysis.Analyzer (if present) is a recognized analyzer type
  // eslint-disable-next-line camelcase
  const analyzer = metadata.MS_Analysis?.Analyzer?.toLowerCase()
  const recognizedAnalyzers = [
    // This list should match _normalize_instrument in sm/engine/dataset.py
    'orbitrap', 'exactive', 'exploris', 'hf-x', 'uhmr', // Orbitraps
    'fticr', 'ft-icr', 'ftms', 'ft-ms', // FT-ICRs
    'tof', 'mrt', 'exploris', 'synapt', 'xevo', // TOFs
  ]
  if (analyzer && !recognizedAnalyzers.some(a => analyzer.includes(a))) {
    validationErrors.push({
      dataPath: '.MS_Analysis.Analyzer',
      message: 'Unrecognized analyzer. Please specify the technology: FT-ICR, Orbitrap or TOF.',
    } as any)
  }

  if (validationErrors.length > 0) {
    throw new UserError(JSON.stringify({
      type: 'failed_validation',
      validation_errors: validationErrors,
    }))
  }
}

export function processingSettingsChanged(ds: EngineDataset, update: DatasetUpdateInput & { metadata: MetadataRoot,
  updateEnrichment: boolean | undefined }) {
  let newDB = false; let procSettingsUpd = false; const metaDiff = null; let enrichmentUpd = false
  if (update.databaseIds) {
    newDB = true
  }

  if (update.updateEnrichment || update.ontologyDbIds) {
    enrichmentUpd = true
  }

  if (update.adducts || update.neutralLosses || update.chemMods
    || update.ppm || update.numPeaks || update.decoySampleSize
    || update.analysisVersion || update.scoringModel || update.scoringModelId || update.computeUnusedMetrics != null) {
    procSettingsUpd = true
  }

  if (update.metadata) {
    const metaDelta = jsondiffpatch.diff(ds.metadata, update.metadata)
    const metaDiff = (jsondiffpatch.formatters as any).jsonpatch.format(metaDelta)

    for (const diffObj of metaDiff) {
      if (diffObj.op !== 'move') { // ignore permutations in arrays
        const procSettingsPaths = [
          '/MS_Analysis/Polarity',
          '/MS_Analysis/Detector_Resolving_Power',
        ]
        for (const path of procSettingsPaths) {
          if (diffObj.path.startsWith(path)) {
            procSettingsUpd = true
          }
        }
      }
    }
  }

  return { newDB: newDB, procSettingsUpd: procSettingsUpd, metaDiff: metaDiff, enrichmentUpd }
}

interface SaveDatasetArgs {
  datasetId?: string;
  submitterId: string;
  groupId?: string;
  description?: string;
  projectIds?: string[];
  principalInvestigator?: { name: string, email: string };
}

const saveDataset = async(entityManager: EntityManager, args: SaveDatasetArgs, requireInsert = false) => {
  const { datasetId, submitterId, groupId, projectIds, principalInvestigator, description } = args
  const groupUpdate = groupId === undefined
    ? {}
    : groupId === null
      ? { groupId: null, groupApproved: false }
      : { groupId, groupApproved: await isMemberOfGroup(entityManager, submitterId, groupId) }
  const piUpdate = principalInvestigator === undefined
    ? {}
    : principalInvestigator === null
      ? { piName: null, piEmail: null }
      : { piName: principalInvestigator.name, piEmail: principalInvestigator.email }
  const dsUpdate = {
    id: datasetId,
    userId: submitterId,
    description,
    ...groupUpdate,
    ...piUpdate,
  }

  if (description === undefined) {
    delete dsUpdate.description
  }

  if (requireInsert) {
    // When creating new datasets, use INSERT so that SQL prevents the same ID from being used twice
    await entityManager.insert(DatasetModel, dsUpdate)
  } else {
    await entityManager.save(DatasetModel, dsUpdate)
  }

  if (projectIds != null) {
    const datasetProjectRepo = entityManager.getRepository(DatasetProjectModel)
    const existingDatasetProjects = await datasetProjectRepo.find({
      relations: ['project'],
      where: { datasetId: datasetId },
    })
    const userProjectRoles = await getUserProjectRoles(entityManager, submitterId)
    const savePromises = projectIds
      .map((projectId) => ({
        projectId,
        approved: [UPRO.MEMBER, UPRO.MANAGER].includes(userProjectRoles[projectId]),
        existing: existingDatasetProjects.find(dp => dp.projectId === projectId),
      }))
      .filter(({ approved, existing }) => existing == null || existing.approved !== approved)
      .map(async({ projectId, approved }) => {
        await datasetProjectRepo.save({ datasetId: datasetId, projectId, approved })
      })
    const deletePromises = existingDatasetProjects
      .filter(({ projectId }) => !projectIds.includes(projectId))
      .map(async({ projectId }) => { await datasetProjectRepo.delete({ datasetId: datasetId, projectId }) })

    await Promise.all([...savePromises, ...deletePromises])
  }
}

const assertCanCreateDataset = (user: ContextUser) => {
  if (user.id == null) {
    throw new UserError('Not authenticated')
  }
}

/**
 * Attribution for a split child, as a tiptap doc.
 *
 * Splitting a public dataset is permitted under CC BY 4.0, which requires attribution, so the
 * credit is written into the child rather than left to the user to remember. Plain text only —
 * the editor's StarterKit has no link mark.
 */
const buildProvenanceDescription = (esDataset: any, parent: EngineDataset, roiName: string) => {
  const submitter = esDataset._source.ds_submitter_name
  const licence = esDataset._source.ds_is_public
    ? ' Original data licensed CC BY 4.0.'
    : ''
  const text = `Derived from the dataset "${parent.name}" (${parent.id})`
    + `${submitter ? `, submitted by ${submitter}` : ''}, by splitting along the region of `
    + `interest "${roiName}".${licence}`
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })
}

/**
 * The dataset doc sm-engine will pass to SMapiDatasetManager.add once the child's files exist.
 *
 * Keys are snake_case because the engine reads this straight out of the database rather than
 * through smApiDatasetRequest's key mapping, and are limited to what generate_ds_config accepts —
 * passing e.g. analysis_version would be a TypeError there. Processing settings are flattened out
 * of the parent's config so the child is annotated exactly as the parent was.
 */
const buildChildDoc = (parent: EngineDataset, childId: string, name: string, isPublic: boolean) => {
  const dsConfig = parent.config || {}
  const isotopeGeneration = dsConfig.isotope_generation || {}
  const fdr = dsConfig.fdr || {}
  const imageGeneration = dsConfig.image_generation || {}

  return {
    id: childId,
    name,
    // The engine writes the child's files here before submitting it for annotation.
    input_path: `s3a://${config.upload.bucket}/${uuid.v4()}`,
    upload_dt: moment.utc().toISOString(),
    metadata: parent.metadata,
    is_public: isPublic,
    moldb_ids: dsConfig.database_ids,
    ontology_db_ids: dsConfig.ontology_db_ids,
    adducts: isotopeGeneration.adducts,
    n_peaks: isotopeGeneration.n_peaks,
    neutral_losses: isotopeGeneration.neutral_losses,
    chem_mods: isotopeGeneration.chem_mods,
    decoy_sample_size: fdr.decoy_sample_size,
    scoring_model_id: fdr.scoring_model_id,
    ppm: imageGeneration.ppm,
    min_px: imageGeneration.min_px,
    compute_unused_metrics: imageGeneration.compute_unused_metrics,
  }
}

interface ResolveSplitProjectArgs {
  projectId?: string | null;
  newProjectName?: string | null;
  parentName: string;
  isPublic: boolean;
}

/** Find the project the children go into, creating one if the user asked for a new one. */
const resolveSplitProject = async(
  ctx: Context, userId: string, args: ResolveSplitProjectArgs
): Promise<string> => {
  const { projectId, newProjectName, parentName, isPublic } = args

  if (projectId != null) {
    const roles = await getUserProjectRoles(ctx.entityManager, userId)
    if (![UPRO.MEMBER, UPRO.MANAGER].includes(roles[projectId])) {
      throw new UserError('You do not have permission to add datasets to that project')
    }
    return projectId
  }

  const name = newProjectName || `${parentName} — ROI split`
  await assertCanPerformAction(ctx, {
    actionType: 'create',
    userId,
    type: 'project',
    visibility: isPublic ? 'public' : 'private',
    actionDt: moment.utc(moment.utc().toDate()),
    source: (ctx as any).getSource(),
  })

  const project = ctx.entityManager.getRepository(ProjectModel)
    .create({ name, isPublic, createdDT: moment.utc() })
  await ctx.entityManager.getRepository(ProjectModel).insert(project as any)
  await ctx.entityManager.insert(UserProjectModel, {
    projectId: project.id,
    userId,
    role: UPRO.MANAGER,
  } as any)
  return project.id
}

const newDatasetId = () => {
  const dt = moment()
  return `${dt.format('YYYY-MM-DD')}_${dt.format('HH')}h${dt.format('mm')}m${dt.format('ss')}s`
}

type CreateDatasetArgs = {
  id?: string,
  input: DatasetCreateInput,
  priority?: Int,
  useLithops?: boolean,
  force?: boolean, // Only used by reprocess
  delFirst?: boolean, // Only used by reprocess
  skipValidation?: boolean, // Only used by reprocess
  performEnrichment?: boolean,
};

const assertUserCanUseMolecularDBs = async(ctx: Context, databaseIds: number[]|undefined) => {
  if (ctx.isAdmin || databaseIds == null) {
    return
  }

  for (const databaseId of databaseIds) {
    const database = await ctx.entityManager.getCustomRepository(MolecularDbRepository)
      .findDatabaseById(ctx, databaseId)
    if (database.groupId != null && !database.isVisible) {
      await assertUserBelongsToGroup(ctx, database.groupId)
    }
  }
}

const setDatabaseIdsInInput = async(
  entityManager: EntityManager, input: DatasetCreateInput | DatasetUpdateInput
): Promise<void> => {
  if (input.databaseIds == null && input.molDBs != null) {
    input.databaseIds = await Promise.all(
      (input.molDBs as string[]).map(async(database) => await mapDatabaseToDatabaseId(entityManager, database))
    )
  }
}

const assertValidScoringModel = async(ctx: Context, scoringModel?: string | null) => {
  if (scoringModel != null) {
    const sm = await ctx.entityManager.findOne(ScoringModel, { where: { name: scoringModel } })
    if (sm == null) {
      throw new UserError(JSON.stringify({
        type: 'failed_validation',
        validation_errors: [{ dataPath: '.metaspaceOptions.scoringModel', message: 'Invalid Scoring Model' }],
      }))
    }
  }
}

const createDataset = async(args: CreateDatasetArgs, ctx: Context) => {
  const { input, priority, force, delFirst, skipValidation, useLithops, performEnrichment } = args
  const datasetId = args.id || newDatasetId()
  const datasetIdWasSpecified = args.id != null
  const action: any = {
    actionType: 'create',
    userId: ctx.user.id,
    datasetId: datasetId,
    groupId: input.groupId,
    type: 'dataset',
    visibility: input.isPublic ? 'public' : 'private',
    actionDt: moment.utc(moment.utc().toDate()),
    source: (ctx as any).getSource(),
    deviceInfo: getDeviceInfo(ctx?.req?.headers?.['user-agent']),
    ipHash: hashIp(ctx.req?.ip),
  }

  logger.info(`Creating dataset '${datasetId}' by '${ctx.user.id}' user ...`)
  let dataset
  if (datasetIdWasSpecified) {
    // Use getDatasetForEditing to validate users' ability to edit, but skip it if they're an admin trying to create a
    // new dataset with a specified ID.
    action.actionType = 'reprocess'
    if (!ctx.isAdmin || await ctx.entityManager.findOne(DatasetModel, datasetId) != null) {
      dataset = await getDatasetForEditing(ctx.entityManager, ctx.user, datasetId)
    }
  } else {
    assertCanCreateDataset(ctx.user)
  }

  const metadata = JSON.parse(input.metadataJson)
  if (!skipValidation || !ctx.isAdmin) {
    validateMetadata(metadata)
  }

  let description
  if (input.description) {
    if (!skipValidation || !ctx.isAdmin) {
      description = input.description
      validateTiptapJson(input.description, 'dataset_description')
    }
  }

  await assertCanPerformAction(ctx, action)
  await setDatabaseIdsInInput(ctx.entityManager, input)
  await assertUserCanUseMolecularDBs(ctx, input.databaseIds as number[])
  await assertValidScoringModel(ctx, input.scoringModel)

  // Only admins can specify the submitterId
  const submitterId = (ctx.isAdmin && input.submitterId) || (dataset && dataset.userId) || ctx.user.id
  const saveDsArgs = {
    datasetId,
    submitterId: submitterId as string,
    description: description as string,
    groupId: input.groupId as (string | undefined),
    projectIds: input.projectIds as string[],
    principalInvestigator: input.principalInvestigator,
  }
  await saveDataset(ctx.entityManager, saveDsArgs, !datasetIdWasSpecified)

  const url = `/v1/datasets/${datasetId}/add`

  if (input?.ppm && input.ppm > 15) {
    input.ppm = 15
  }

  if (input.neutralLosses) {
    input.neutralLosses = cleanEmptyStrings(input.neutralLosses as string[])
  }

  if (input.chemMods) {
    input.chemMods = cleanEmptyStrings(input.chemMods as string[])
  }

  await smApiDatasetRequest(url, {
    doc: { ...input, metadata, size_hash: input.sizeHashJson ? JSON.parse(input.sizeHashJson) : undefined },
    priority: priority,
    use_lithops: useLithops,
    perform_enrichment: performEnrichment,
    force: force,
    del_first: delFirst,
    email: ctx.user.email,
  })

  await performAction(ctx, action)

  logger.info(`Dataset '${datasetId}' was created`)
  return JSON.stringify({ datasetId, status: 'success' })
}

const MutationResolvers: FieldResolversFor<Mutation, void> = {

  reprocessDataset: async(source, {
    id, priority,
    useLithops, performEnrichment,
  }, ctx: Context) => {
    const engineDataset = await ctx.entityManager.findOne(EngineDataset, id)
    if (engineDataset === undefined) {
      throw new UserError('Dataset does not exist')
    }

    return await createDataset({
      id,
      input: {
        ...engineDataset,
        metadataJson: JSON.stringify(engineDataset.metadata),
      } as any, // TODO: map this properly
      priority,
      useLithops,
      performEnrichment,
      force: true,
      skipValidation: true,
      delFirst: true,
    }, ctx)
  },

  createDataset: async(source, args, ctx: Context) => {
    return await createDataset(args, ctx)
  },

  updateDataset: async(source, args, ctx: Context) => {
    const {
      id: datasetId, input: update, reprocess, skipValidation, delFirst, force, priority, useLithops,
      performEnrichment,
    } = args

    logger.info(`User '${ctx.user.id}' updating '${datasetId}' dataset...`)
    const dataset = await getDatasetForEditing(ctx.entityManager, ctx.user, datasetId)

    let metadata
    if (update.metadataJson) {
      metadata = JSON.parse(update.metadataJson)
      if (!skipValidation || !ctx.isAdmin) {
        validateMetadata(metadata)
      }
    }

    if (update?.ppm && update.ppm > 15) {
      update.ppm = 15
    }

    let description : string | null | undefined = update.description === null ? null : undefined
    if (update.description) {
      if (!skipValidation || !ctx.isAdmin) {
        description = update.description
        validateTiptapJson(update.description, 'dataset_description')
      }
    }

    if (!ctx.isAdmin) {
      if (update.isPublic === false) {
        await checkProjectsPublicationStatus(ctx.entityManager, datasetId, [PSO.PUBLISHED])
      }
      if (update.projectIds != null) {
        await checkNoPublishedProjectRemoved(ctx.entityManager, datasetId, update.projectIds as string[])
      }
    }

    await setDatabaseIdsInInput(ctx.entityManager, update)
    await assertUserCanUseMolecularDBs(ctx, update.databaseIds as number[]|undefined)

    const engineDataset = await ctx.entityManager.findOneOrFail(EngineDataset, datasetId)
    let isEnriched : boolean | any = false

    if (performEnrichment) {
      isEnriched = await ctx.entityManager.createQueryBuilder(DatasetEnrichmentModel,
        'dsEnrichment')
        .where('dsEnrichment.datasetId = :datasetId', { datasetId })
        .getOne()
    }

    const { newDB, procSettingsUpd, enrichmentUpd } = processingSettingsChanged(engineDataset, {
      ...update,
      metadata,
      updateEnrichment: performEnrichment && !isEnriched,
    })
    const reprocessingNeeded = newDB || procSettingsUpd || enrichmentUpd
    const countAsPrivate = engineDataset.isPublic === true && update.isPublic === false

    const action: any = {
      actionType: countAsPrivate ? 'create' : (reprocessingNeeded ? 'reprocess' : 'update'),
      userId: ctx.user.id,
      datasetId: datasetId,
      type: 'dataset',
      groupId: update.groupId || dataset.groupId,
      visibility: (update.isPublic === undefined ? engineDataset.isPublic : update.isPublic) ? 'public' : 'private',
      actionDt: moment.utc(moment.utc().toDate()),
      source: (ctx as any).getSource(),
      deviceInfo: getDeviceInfo(ctx?.req?.headers?.['user-agent']),
      ipHash: hashIp(ctx.req?.ip),
    }
    await assertCanPerformAction(ctx, action)

    const submitterId = (ctx.isAdmin && update.submitterId) || dataset.userId
    const saveDatasetArgs = {
      datasetId,
      submitterId: submitterId as string,
      description: description as string,
      groupId: update.groupId as (string | undefined),
      projectIds: update.projectIds as string[],
      principalInvestigator: update.principalInvestigator,
    }

    if (reprocess) {
      await saveDataset(ctx.entityManager, saveDatasetArgs)
      await smApiDatasetRequest(`/v1/datasets/${datasetId}/add`, {
        doc: { ...engineDataset, ...update, ...(metadata ? { metadata } : {}) },
        del_first: procSettingsUpd || delFirst, // delete old results if processing settings changed
        priority: priority,
        use_lithops: useLithops,
        perform_enrichment: performEnrichment,
        force: force,
        email: ctx.user.email,
      })
    } else {
      if (reprocessingNeeded) {
        throw new UserError(JSON.stringify({
          type: 'reprocessing_needed',
          message: 'Reprocessing needed. Provide \'reprocess\' flag.',
        }))
      } else {
        await saveDataset(ctx.entityManager, saveDatasetArgs)
        await smApiUpdateDataset(datasetId, {
          // Unfortunately `update` has bad generated types, so `as any` is needed here
          ..._.omit(update, 'metadataJson') as any,
          ...(metadata ? { metadata } : {}),
        }, {
          priority,
          useLithops,
          performEnrichment,
          force,
        })
      }
    }
    await performAction(ctx, action)

    logger.info(`Dataset '${datasetId}' was updated`)
    return JSON.stringify({ datasetId, status: 'success' })
  },

  deleteDataset: async(source, { id: datasetId, force }, ctx: Context) => {
    if (ctx.user.id == null) {
      throw new UserError('Unauthorized')
    }
    // Authorization handled in deleteDataset
    const resp = await deleteDataset(ctx.entityManager, ctx.user, datasetId, { force })
    return JSON.stringify(resp)
  },

  addOpticalImage: async(source, { input }, ctx: Context) => {
    const { datasetId, transform } = input
    const { imageUrl } = input

    logger.info(`User '${ctx.getUserIdOrFail()}' adding optical image to '${datasetId}' dataset...`)
    await getDatasetForEditing(ctx.entityManager, ctx.user, datasetId)
    const resp = await smApiDatasetRequest(`/v1/datasets/${datasetId}/add-optical-image`, {
      url: imageUrl, transform,
    })

    logger.info(`Optical image was added to '${datasetId}' dataset`)
    return JSON.stringify(resp)
  },

  copyRawOpticalImage: async(source, { originDatasetId, destinyDatasetId }, ctx: Context) => {
    await esDatasetByID(originDatasetId, ctx.user) // check if user has access to origin dataset
    await esDatasetByID(destinyDatasetId, ctx.user) // check if user has access to destiny dataset

    const engineDataset = await ctx.entityManager.getRepository(EngineDataset).findOne(originDatasetId)

    if (engineDataset && engineDataset.opticalImage) {
      const s3 = getS3Client()
      await s3.copyObject({
        Bucket: `${config.upload.bucket}/raw_optical/${destinyDatasetId}`,
        CopySource: `${config.upload.bucket}/raw_optical/${originDatasetId}/${engineDataset.opticalImage}`,
        Key: engineDataset.opticalImage,
      }).promise()

      return engineDataset.opticalImage
    }
  },

  addRoi: async(source, { datasetId, geoJson }, ctx: Context) => {
    const typedJson : any = geoJson

    try {
      await ctx.entityManager.transaction(async txn => {
        const ds = await getDatasetForEditing(txn, ctx.user, datasetId)
        const resp = await txn.update(EngineDataset, ds.id, {
          roi: typedJson,
        })
        logger.info(`ROI was added to '${datasetId}' dataset`)

        return JSON.stringify(resp)
      })
    } catch (e) {
      return JSON.stringify(e)
    }
  },

  splitDatasetByRois: async(source, { input, useLithops }, ctx: Context) => {
    const userId = ctx.getUserIdOrFail()
    const { datasetId, rois, projectId, newProjectName, groupId, isPublic } = input

    if (!rois || rois.length === 0) {
      throw new UserError('Select at least one ROI to split along')
    }

    const esDataset = await esDatasetByID(datasetId, ctx.user)
    if (!esDataset) {
      throw new UserError('Dataset does not exist')
    }
    // Copies the raw files into the requester's account, so the licence — not view access — is
    // the gate. See assertCanSplitDataset.
    await assertCanSplitDataset(esDataset, ctx)
    const canEditParent = await canEditEsDataset(esDataset, ctx)

    const parent = await ctx.entityManager.findOne(EngineDataset, datasetId)
    if (parent == null) {
      throw new UserError('Dataset does not exist')
    }
    const parentGraphqlDs = await ctx.entityManager.findOne(DatasetModel, datasetId)

    const roiIds = rois.map((roi: any) => String(roi.roiId))
    const roiRows = await ctx.entityManager.createQueryBuilder(Roi, 'roi')
      .where('roi.datasetId = :datasetId', { datasetId })
      .andWhere('roi.id IN (:...roiIds)', { roiIds })
      .andWhere(new Brackets(qb => {
        qb.where('roi.userId = :userId', { userId }).orWhere('roi.isDefault = true')
      }))
      .getMany()
    if (roiRows.length !== roiIds.length) {
      throw new UserError('One or more of the selected ROIs no longer exists')
    }

    // Re-check the size floor server-side: the dialog's numbers could be stale, and a dataset
    // below the floor cannot produce usable annotations.
    const stats = await fetchRoiSplitStats(datasetId, roiIds)
    const statsById = new Map(stats.map(stat => [stat.roiId, stat]))
    const tooSmall = stats.filter(stat => stat.blocked)
    if (tooSmall.length > 0) {
      throw new UserError(JSON.stringify({
        type: 'roi_too_small',
        hint: `These ROIs are below the ${MIN_ROI_PIXELS} pixel minimum and cannot be split into `
          + `usable datasets: ${tooSmall.map(stat => `${stat.name} (${stat.nPixels} px)`).join(', ')}`,
      }))
    }

    // Each child runs the full annotation pipeline, so each counts against the plan. Checked
    // up front so a split is refused before any files are written.
    const actionTemplate = {
      actionType: 'create',
      userId,
      type: 'dataset',
      visibility: isPublic ? 'public' : 'private',
      source: (ctx as any).getSource(),
      deviceInfo: getDeviceInfo(ctx?.req?.headers?.['user-agent']),
      ipHash: hashIp(ctx.req?.ip),
    }
    for (const roi of roiRows) {
      await assertCanPerformAction(ctx, {
        ...actionTemplate,
        datasetId: `split-preflight-${roi.id}`,
        actionDt: moment.utc(moment.utc().toDate()),
      })
    }

    const targetProjectId = await resolveSplitProject(ctx, userId, {
      projectId,
      newProjectName,
      parentName: parent.name || datasetId,
      isPublic: isPublic ?? false,
    })

    const childIds = await generateChildDatasetIds(roiRows.length, async(id: string) =>
      await ctx.entityManager.findOne(EngineDataset, id) != null
      || await ctx.entityManager.findOne(DatasetModel, id) != null)

    // Children of a stranger's public dataset start private so nobody republishes someone else's
    // data under their own name by accident; your own datasets keep their visibility.
    const childIsPublic = isPublic ?? (canEditParent ? parent.isPublic : false)
    const nameByRoiId = new Map(rois.map((roi: any) => [String(roi.roiId), roi.name]))

    const jobId = await ctx.entityManager.transaction(async txn => {
      const job = await txn.save(DatasetSplitJob, {
        parentDsId: datasetId,
        parentDsName: parent.name || datasetId,
        userId,
        submitterEmail: ctx.user.email,
        projectId: targetProjectId,
        status: 'QUEUED',
        emailSent: false,
      } as any)

      for (const [index, roi] of roiRows.entries()) {
        const childId = childIds[index]
        const childName = nameByRoiId.get(String(roi.id)) || `${parent.name} — ${roi.name}`

        await saveDataset(txn, {
          datasetId: childId,
          submitterId: userId,
          groupId: groupId ?? undefined,
          // PI describes who generated the data, not who pressed split, so it is inherited.
          principalInvestigator: parentGraphqlDs?.piName != null
            ? { name: parentGraphqlDs.piName, email: parentGraphqlDs.piEmail as string }
            : undefined,
          projectIds: [targetProjectId],
          description: buildProvenanceDescription(esDataset, parent, roi.name),
        }, true)

        await txn.save(DatasetSplitChild, {
          jobId: job.id,
          childDsId: childId,
          roiId: String(roi.id),
          roiName: roi.name,
          roiGeojson: roi.geojson,
          nPixels: statsById.get(String(roi.id))?.nPixels ?? null,
          status: 'PENDING',
          doc: buildChildDoc(parent, childId, childName, childIsPublic),
        } as any)
      }
      return job.id
    })

    for (const roi of roiRows) {
      await performAction(ctx, {
        ...actionTemplate,
        datasetId: childIds[roiRows.indexOf(roi)],
        actionDt: moment.utc(moment.utc().toDate()),
      })
    }

    await smApiDatasetRequest('/v1/split/run', { job_id: jobId, use_lithops: useLithops })

    logger.info(`Dataset '${datasetId}' split into ${childIds.length} datasets by '${userId}'`)
    return JSON.stringify({ jobId, projectId: targetProjectId, datasetIds: childIds })
  },

  deleteOpticalImage: async(source, { datasetId }, ctx: Context) => {
    logger.info(`User '${ctx.getUserIdOrFail()}' deleting optical image from '${datasetId}' dataset...`)
    await getDatasetForEditing(ctx.entityManager, ctx.user, datasetId)
    const resp = await smApiDatasetRequest(`/v1/datasets/${datasetId}/del-optical-image`, {})

    logger.info(`Optical image was deleted from '${datasetId}' dataset`)
    return JSON.stringify(resp)
  },

  addDatasetExternalLink: async(
    source,
    { datasetId, provider, link, replaceExisting },
    ctx: Context
  ) => {
    await ctx.entityManager.transaction(async txn => {
      const ds = await getDatasetForEditing(txn, ctx.user, datasetId)
      await txn.update(DatasetModel, ds.id, {
        externalLinks: addExternalLink(ds.externalLinks, provider, link, replaceExisting),
      })
    })

    return await esDatasetByID(datasetId, ctx.user)
  },

  removeDatasetExternalLink: async(
    source,
    { datasetId, provider, link },
    ctx: Context
  ) => {
    await ctx.entityManager.transaction(async txn => {
      const ds = await getDatasetForEditing(txn, ctx.user, datasetId)
      await txn.update(DatasetModel, ds.id, {
        externalLinks: removeExternalLink(ds.externalLinks, provider, link),
      })
    })

    return await esDatasetByID(datasetId, ctx.user)
  },

  compareROIs: async(
    source,
    {
      datasetId, ticNormalize = true, logTransformTic = true,
      chunkSize = 1000, nPixelSamples = 10000,
    },
    ctx: Context
  ) => {
    try {
      if (ctx.user.id == null) {
        throw new UserError('Not authenticated')
      }
      await esDatasetByID(datasetId, ctx.user) // check if user has access

      // Check if there are existing diff analysis results and if ROIs match
      const userRoisCount = await ctx.entityManager.createQueryBuilder(Roi, 'roi')
        .where('roi.datasetId = :datasetId', { datasetId })
        .andWhere('roi.userId = :userId', { userId: ctx.user.id })
        .getCount()

      let qb = ctx.entityManager.createQueryBuilder(DiffRoi, 'diffRoi')
        .leftJoin('diffRoi.roi', 'roi')
        .select('DISTINCT diffRoi.roiId', 'roiId')
        .where('roi.datasetId = :datasetId', { datasetId })

      if (userRoisCount > 0) {
        qb = qb.andWhere('roi.userId = :userId', { userId: ctx.user.id })
      } else {
        qb = qb.andWhere('roi.isDefault = true')
      }

      const existingRoiIds = await qb.getRawMany()

      if (existingRoiIds.length > 0) {
        const previousRoiIds = new Set(existingRoiIds.map(result => result.roiId))
        let qbCurrent = ctx.entityManager.createQueryBuilder(Roi, 'roi')
          .select('id', 'id')
          .where('roi.datasetId = :datasetId', { datasetId })

        if (userRoisCount > 0) {
          qbCurrent = qbCurrent.andWhere('roi.userId = :userId', { userId: ctx.user.id })
        } else {
          qbCurrent = qbCurrent.andWhere('roi.isDefault = true')
        }

        const currentDefaultRois = await qbCurrent.getRawMany()
        const currentRoiIds = new Set(currentDefaultRois.map((roi: any) => roi.id))

        // Only skip recalculation if ROI sets match exactly
        const roiSetsMatch = previousRoiIds.size === currentRoiIds.size
          && [...previousRoiIds].every(id => currentRoiIds.has(id))

        if (roiSetsMatch) {
          logger.info(`ROIs for dataset '${datasetId}' haven't changed (${currentRoiIds.size} ROIs), `
            + 'skipping diff analysis recalculation')
          return true
        }

        logger.info(`ROIs for dataset '${datasetId}' have changed, proceeding with diff analysis recalculation`)
      } else {
        logger.info(`No existing diff analysis found for dataset '${datasetId}', proceeding with calculation`)
      }

      await smApiDatasetRequest('/v1/diffroi/compareROIs', {
        ds_id: datasetId,
        TIC_normalize: ticNormalize,
        log_transform_tic: logTransformTic,
        chunk_size: chunkSize,
        n_pixel_samples: nPixelSamples,
      })

      return true
    } catch (e) {
      return e
    }
  },

  createRoi: async(
    source: any,
    { datasetId, input }: any,
    ctx: Context
  ) => {
    if (ctx.user.id == null) {
      throw new UserError('Not authenticated')
    }

    // Check if user has access to the dataset
    const dataset = await esDatasetByID(datasetId, ctx.user)
    if (!dataset) {
      throw new UserError('Dataset not found or access denied')
    }

    try {
      const geojson = JSON.parse(input.geojson)
      const canEdit = await canEditEsDataset(dataset, ctx)
      const roi = ctx.entityManager.create(Roi, {
        datasetId,
        userId: ctx.user.id,
        name: input.name,
        isDefault: canEdit,
        geojson,
      })

      const savedRoi = await ctx.entityManager.save(roi)

      return {
        id: savedRoi.id,
        datasetId: savedRoi.datasetId,
        userId: savedRoi.userId,
        name: savedRoi.name,
        isDefault: savedRoi.isDefault,
        geojson: JSON.stringify(savedRoi.geojson),
      }
    } catch (e) {
      throw new UserError('Invalid GeoJSON or other error creating ROI')
    }
  },

  updateRoi: async(
    source: any,
    { id, input }: any,
    ctx: Context
  ) => {
    if (ctx.user.id == null) {
      throw new UserError('Not authenticated')
    }

    const roi = await ctx.entityManager.findOne(Roi, { where: { id } })
    if (!roi) {
      throw new UserError('ROI not found')
    }

    // Check if user has access to the dataset
    const dataset = await esDatasetByID(roi.datasetId, ctx.user)
    if (!dataset) {
      throw new UserError('Dataset not found or access denied')
    }

    const canEdit = await canEditEsDataset(dataset, ctx)

    const canEdiRoi = canEdit || ctx.user.role?.includes('admin') || roi.userId === ctx.user.id
    // Check if user owns this ROI or is admin
    if (!canEdiRoi) {
      throw new UserError('You can only edit ROIs you created')
    }

    try {
      const geojson = JSON.parse(input.geojson)

      await ctx.entityManager.update(Roi, id, {
        name: input.name,
        userId: ctx.user.id,
        isDefault: canEdit,
        geojson,
      })

      const updatedRoi = await ctx.entityManager.findOne(Roi, { where: { id } })

      return {
        id: updatedRoi!.id,
        datasetId: updatedRoi!.datasetId,
        userId: updatedRoi!.userId,
        name: updatedRoi!.name,
        isDefault: updatedRoi!.isDefault,
        geojson: JSON.stringify(updatedRoi!.geojson),
      }
    } catch (e) {
      throw new UserError('Invalid GeoJSON or other error updating ROI')
    }
  },

  deleteRoi: async(
    source: any,
    { id }: any,
    ctx: Context
  ) => {
    if (ctx.user.id == null) {
      throw new UserError('Not authenticated')
    }

    const roi = await ctx.entityManager.findOne(Roi, { where: { id } })
    if (!roi) {
      throw new UserError('ROI not found')
    }

    // Check if user has access to the dataset
    const dataset = await esDatasetByID(roi.datasetId, ctx.user)
    if (!dataset) {
      throw new UserError('Dataset not found or access denied')
    }

    // Check if user owns this ROI or is admin
    if (roi.userId !== ctx.user.id && !ctx.user.role?.includes('admin')) {
      throw new UserError('You can only delete ROIs you created')
    }

    await ctx.entityManager.delete(Roi, id)
    return true
  },

  copyRoisToDatasets: async(
    source: any,
    { sourceDatasetId, targetDatasetIds }: { sourceDatasetId: string; targetDatasetIds: string[] },
    ctx: Context
  ) => {
    if (ctx.user.id == null) {
      throw new UserError('Not authenticated')
    }

    const sourceDataset = await esDatasetByID(sourceDatasetId, ctx.user)
    if (!sourceDataset) {
      throw new UserError('Source dataset not found or access denied')
    }

    const userRoiCount = await ctx.entityManager.createQueryBuilder(Roi, 'roi')
      .where('roi.datasetId = :datasetId', { datasetId: sourceDatasetId })
      .andWhere('roi.userId = :userId', { userId: ctx.user.id })
      .getCount()

    const sourceRois = userRoiCount > 0
      ? await ctx.entityManager.find(Roi, { where: { datasetId: sourceDatasetId, userId: ctx.user.id } })
      : await ctx.entityManager.find(Roi, { where: { datasetId: sourceDatasetId, isDefault: true } })

    if (sourceRois.length === 0) {
      throw new UserError('No ROIs found on source dataset')
    }

    for (const targetDatasetId of targetDatasetIds) {
      const targetDataset = await esDatasetByID(targetDatasetId, ctx.user)
      if (!targetDataset) {
        throw new UserError(`Target dataset ${targetDatasetId} not found or access denied`)
      }
      const canEdit = await canEditEsDataset(targetDataset, ctx)

      await ctx.entityManager.createQueryBuilder()
        .delete()
        .from(Roi)
        .where('"dataset_id" = :datasetId AND "user_id" = :userId', {
          datasetId: targetDatasetId,
          userId: ctx.user.id,
        })
        .execute()

      for (const roi of sourceRois) {
        const newRoi = ctx.entityManager.create(Roi, {
          datasetId: targetDatasetId,
          userId: ctx.user.id,
          name: roi.name,
          isDefault: canEdit,
          geojson: roi.geojson,
        })
        await ctx.entityManager.save(newRoi)
      }
    }

    return true
  },

  runSegmentation: async(
    source: any,
    {
      datasetId, algorithm = 'pca_gmm',
      databaseIds = [],
      fdr = 0.2, adducts, minMz, maxMz, offSample = false, params,
    }: any,
    ctx: Context
  ) => {
    const startTime = Date.now()
    console.log(`[SEGMENTATION_PERF] GraphQL runSegmentation started
       for dataset ${datasetId} at ${new Date().toISOString()}`)

    if (ctx.user.id == null) {
      throw new UserError('Not authenticated')
    }

    const dataset = await esDatasetByID(datasetId, ctx.user)
    if (!dataset) {
      throw new UserError('Dataset not found or access denied')
    }

    const body: Record<string, any> = {
      ds_id: datasetId,
      algorithm,
      database_ids: databaseIds,
      fdr,
      params: params ? JSON.parse(params) : {},
      email: ctx.user.email,
    }
    if (adducts != null) body.adducts = adducts
    if (minMz != null) body.min_mz = minMz
    if (maxMz != null) body.max_mz = maxMz
    body.off_sample = offSample

    console.log(`[SEGMENTATION_PERF] GraphQL parameters prepared
       for dataset ${datasetId}, algorithm: ${algorithm}, databases: ${databaseIds.length}, fdr: ${fdr}`)

    try {
      // Scoped to datasetId; ion_profile rows cascade from segmentation. Delete before enqueue
      // so the new image_segmentation_job inserted by the API is not removed.
      await ctx.entityManager.transaction(async(em) => {
        await em.delete(Segmentation, { datasetId })
        await em.delete(ImageSegmentationJob, { datasetId })
        await em.delete(DatasetDiagnostic, {
          datasetId,
          type: DiagnosticTypeOptions.SEGMENTATION,
        })
      })

      const apiCallStart = Date.now()
      await smApiDatasetRequest('/v1/segmentation/run', body)
      const apiCallEnd = Date.now()

      const totalTime = Date.now() - startTime
      console.log(`[SEGMENTATION_PERF] GraphQL runSegmentation completed for dataset ${datasetId}`)
      console.log(`[SEGMENTATION_PERF] Total GraphQL
         time: ${totalTime}ms, API call time: ${apiCallEnd - apiCallStart}ms`)

      return true
    } catch (error) {
      const totalTime = Date.now() - startTime
      console.error(`[SEGMENTATION_PERF] GraphQL
         runSegmentation failed for dataset ${datasetId} after ${totalTime}ms:`, error)
      throw new UserError('Failed to submit segmentation job. Please try again later.')
    }
  },

  updateSegmentation: async(
    source: any,
    { id, name }: { id: string, name: string },
    ctx: Context
  ) => {
    if (ctx.user.id == null) {
      throw new UserError('Not authenticated')
    }

    const segmentation = await ctx.entityManager.findOne(Segmentation, { where: { id } })
    if (!segmentation) {
      throw new UserError('Segmentation not found')
    }

    // Check if user has access to the dataset
    const dataset = await esDatasetByID(segmentation.datasetId, ctx.user)
    if (!dataset) {
      throw new UserError('Dataset not found or access denied')
    }

    // Check if user can edit the dataset
    const canEdit = await canEditEsDataset(dataset, ctx)
    if (!canEdit) {
      throw new UserError('You do not have permission to edit this segmentation')
    }

    // Update the segmentation name
    await ctx.entityManager.update(Segmentation, id, {
      name: name.trim(),
      updatedAt: moment.utc(moment.utc().toDate()),
    })

    // Return the updated segmentation
    const updatedSegmentation = await ctx.entityManager.findOne(Segmentation, { where: { id } })
    return updatedSegmentation
  },
}

export default MutationResolvers
