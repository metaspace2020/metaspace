import * as jsondiffpatch from 'jsondiffpatch'
import logger from '../../../utils/logger'
import * as Ajv from 'ajv'
import { UserError } from 'graphql-errors'
import { EntityManager } from 'typeorm'
import * as moment from 'moment'
import * as _ from 'lodash'

import { smApiDatasetRequest } from '../../../utils'
import { UserProjectRoleOptions as UPRO } from '../../project/model'
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
import { EngineDataset, ScoringModel, Roi, DiffRoi } from '../../engine/model'
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

    const action: any = {
      actionType: reprocessingNeeded ? 'reprocess' : 'update',
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

    // Check if user owns this ROI or is admin
    if (roi.userId !== ctx.user.id && !ctx.user.role?.includes('admin')) {
      throw new UserError('You can only edit ROIs you created')
    }

    try {
      const geojson = JSON.parse(input.geojson)
      const canEdit = await canEditEsDataset(dataset, ctx)

      await ctx.entityManager.update(Roi, id, {
        name: input.name,
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
}

export default MutationResolvers
