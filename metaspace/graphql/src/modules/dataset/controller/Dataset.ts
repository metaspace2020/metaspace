import * as _ from 'lodash'
import { dsField } from '../../../../datasetFilters'
import { DatasetSource, FieldResolversFor } from '../../../bindingTypes'
import { ProjectSourceRepository } from '../../project/ProjectSourceRepository'
import { Dataset as DatasetModel } from '../model'
import {
  DatasetDiagnostic as DatasetDiagnosticModel,
  EngineDataset,
  OpticalImage as OpticalImageModel,
  ScoringModel as ScoringModelModel,
} from '../../engine/model'
import { Dataset, OpticalImage, OpticalImageType, ScoringModel } from '../../../binding'
import getScopeRoleForEsDataset from '../operation/getScopeRoleForEsDataset'
import logger from '../../../utils/logger'
import config from '../../../utils/config'
import { Context } from '../../../context'
import getGroupAdminNames from '../../group/util/getGroupAdminNames'
import * as DataLoader from 'dataloader'
import { esDatasetByID } from '../../../../esConnector'
import { ExternalLink } from '../../project/ExternalLink'
import canViewEsDataset from '../operation/canViewEsDataset'
import { MolecularDB } from '../../moldb/model'
import { MolecularDbRepository } from '../../moldb/MolecularDbRepository'
import { getS3Client } from '../../../utils/awsClient'
import { In, IsNull } from 'typeorm'
import canEditEsDataset from '../operation/canEditEsDataset'
import canDeleteEsDataset from '../operation/canDeleteEsDataset'
import { DatasetEnrichment as DatasetEnrichmentModel } from '../../enrichmentdb/model'

interface DbDataset {
  id: string;
  roi: any | null;
  thumbnail: string | null;
  thumbnail_url: string | null;
  ion_thumbnail: string | null;
  ion_thumbnail_url: string | null;
  transform: number[][] | null;
  external_links: ExternalLink[] | null;
}
const getDbDatasetById = async(ctx: Context, id: string): Promise<DbDataset | null> => {
  const dataloader = ctx.contextCacheGet('getDbDatasetByIdDataLoader', [], () => {
    return new DataLoader(async(datasetIds: string[]): Promise<any[]> => {
      const results = await ctx.entityManager.query(`
      SELECT ds.id, ds.thumbnail_url, ds.ion_thumbnail_url, 
             ds.transform, ds.roi, gds.external_links
      FROM public.dataset ds
      JOIN graphql.dataset gds on ds.id = gds.id
      WHERE ds.id = ANY($1)`,
      [datasetIds])
      const keyedResults = _.keyBy(results, 'id')
      return datasetIds.map(id => keyedResults[id] || null)
    })
  })
  return await dataloader.load(id)
}

const getEnrichment = async(ctx: Context, datasetId: string): Promise<any> => {
  const datasetEnrichment = await ctx.entityManager.createQueryBuilder(DatasetEnrichmentModel,
    'dsEnrichment')
    .where('dsEnrichment.datasetId = :datasetId', { datasetId })
    .getOne()

  return datasetEnrichment
}

export const thumbnailOpticalImageUrl = async(ctx: Context, datasetId: string) => {
  const result = await getDbDatasetById(ctx, datasetId)
  return result?.thumbnail_url ?? null
}

const getOpticalImagesByDsId = async(ctx: Context, id: string): Promise<OpticalImage[]> => {
  const dataloader = ctx.contextCacheGet('getOpticalImagesByDsIdDataLoader', [], () => {
    return new DataLoader(async(datasetIds: string[]): Promise<OpticalImage[][]> => {
      const rawResults: OpticalImageModel[] = await ctx.entityManager.query(
        'SELECT * from public.optical_image WHERE ds_id = ANY($1)', [datasetIds])
      const results = rawResults.map(({ type, ...rest }) => ({
        ...rest,
        type: type.toUpperCase() as OpticalImageType,
      }))
      const groupedResults = _.groupBy(results, 'ds_id')
      return datasetIds.map(id => groupedResults[id] || [])
    })
  })
  return await dataloader.load(id)
}

export const rawOpticalImage = async(datasetId: string, ctx: Context) => {
  const ds = await esDatasetByID(datasetId, ctx.user) // check if user has access
  if (ds) {
    const engineDataset = await ctx.entityManager.getRepository(EngineDataset).findOne(datasetId)
    if (engineDataset && engineDataset.opticalImage) {
      const s3 = getS3Client()
      const imageUrl = s3.getSignedUrl('getObject',
        {
          Bucket: `${config.upload.bucket}/raw_optical/${datasetId}`,
          Key: engineDataset.opticalImage,
          Expires: 1800,
        })

      return {
        url: imageUrl,
        uuid: engineDataset.opticalImage,
        transform: engineDataset.transform,
      }
    }
  }
  return null
}

const canDownloadDataset = async(ds: DatasetSource, ctx: Context) => {
  return ctx.isAdmin || (config.features.imzmlDownload && await canViewEsDataset(ds, ctx.user))
}

const DatasetResolvers: FieldResolversFor<Dataset, DatasetSource> = {
  id(ds) {
    return ds._source.ds_id
  },

  name(ds) {
    return ds._source.ds_name
  },

  uploadDT(ds) {
    return new Date(ds._source.ds_upload_dt).toISOString()
  },

  statusUpdateDT(ds) {
    const date = ds._source.ds_status_update_dt || ds._source.ds_upload_dt
    return new Date(date).toISOString()
  },

  configJson(ds) {
    return JSON.stringify(ds._source.ds_config)
  },

  metadataJson(ds) {
    return JSON.stringify(ds._source.ds_meta)
  },

  async roiJson(ds, args, ctx) {
    const result = await getDbDatasetById(ctx, ds._source.ds_id)
    return result?.roi ? JSON.stringify(result?.roi) : null
  },

  isPublic(ds) {
    return ds._source.ds_is_public
  },

  async isEnriched(ds, args, ctx) {
    const result = await getEnrichment(ctx, ds._source.ds_id)
    return !!result
  },

  async databases(ds, _, ctx): Promise<MolecularDB[]> {
    return await ctx.entityManager.getCustomRepository(MolecularDbRepository)
      .findDatabasesByIds(ctx, ds._source.ds_moldb_ids ?? [])
  },

  async molDBs(ds, _, ctx) {
    if (ds._source.ds_moldb_ids == null) {
      // To handle datasets that failed to migrate for some reason
      logger.error(`Empty "ds_moldb_ids" field for "${ds._source.ds_id}" dataset`)
      return []
    }
    const databases = await ctx.entityManager.getCustomRepository(MolecularDbRepository)
      .findDatabasesByIds(ctx, ds._source.ds_moldb_ids)
    return databases.map(db => db.name)
  },

  adducts(ds) {
    return ds._source.ds_adducts
  },

  neutralLosses(ds) {
    return ds._source.ds_neutral_losses
  },

  chemMods(ds) {
    return ds._source.ds_chem_mods
  },

  acquisitionGeometry(ds) {
    return JSON.stringify(ds._source.ds_acq_geometry)
  },

  sizeHash(ds) {
    return JSON.stringify(ds._source.ds_size_hash)
  },

  organism(ds) { return dsField(ds, 'organism') },
  organismPart(ds) { return dsField(ds, 'organismPart') },
  condition(ds) { return dsField(ds, 'condition') },
  growthConditions(ds) { return dsField(ds, 'growthConditions') },
  polarity(ds) { return dsField(ds, 'polarity').toUpperCase() },
  ionisationSource(ds) { return dsField(ds, 'ionisationSource') },
  maldiMatrix(ds) { return dsField(ds, 'maldiMatrix') },
  metadataType(ds) { return dsField(ds, 'metadataType') },

  async submitter(ds, args, ctx) {
    if (ds._source.ds_submitter_id == null) {
      // WORKAROUND: Somehow datasets become broken and are indexed without a submitter
      logger.error(
        'Submitter ID is null: ',
        _.pick(ds._source, [
          'ds_id', 'ds_name', 'ds_status', 'ds_submitter_id', 'ds_submitter_name', 'ds_submitter_email',
        ])
      )
    }

    return {
      id: ds._source.ds_submitter_id || 'NULL',
      name: ds._source.ds_submitter_name,
      email: ds._source.ds_submitter_email,
      scopeRole: await getScopeRoleForEsDataset(ds, ctx),
    }
  },

  group(ds, args, ctx) {
    if (ds._source.ds_group_id) {
      const groupId = ds._source.ds_group_id
      return {
        id: groupId,
        name: ds._source.ds_group_name || 'NULL',
        shortName: ds._source.ds_group_short_name || 'NULL',
        urlSlug: null,
        members: null,
        get adminNames(): Promise<string[]> {
          return getGroupAdminNames(ctx, groupId)
        },
      }
    } else {
      return null
    }
  },

  groupApproved(ds) {
    return ds._source.ds_group_approved === true
  },

  async projects(ds, args, ctx) {
    // If viewing someone else's DS, only approved projects are visible, so exit early if there are no projects in elasticsearch
    const projectIds = _.castArray(ds._source.ds_project_ids).filter(id => id != null)
    const canSeeUnapprovedProjects = ctx.isAdmin || (ctx.user.id === ds._source.ds_submitter_id)
    if (!canSeeUnapprovedProjects && projectIds.length === 0) {
      return []
    }

    const projects = await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
      .findProjectsByDatasetId(ctx, ds._source.ds_id)
    return projects.map(p => ({
      id: p.id,
      name: p.name,
      isPublic: null,
      urlSlug: null,
      publicationStatus: p.publicationStatus,
    }))
  },
  async description(ds, _, { cachedGetEntityById }: Context) {
    const dataset = await cachedGetEntityById(DatasetModel, ds._source.ds_id)
    if (dataset == null) {
      logger.warn(`Elasticsearch DS does not exist in DB: ${ds._source.ds_id}`)
      return null
    }
    return dataset.description ? JSON.stringify(dataset.description) : undefined
  },
  async principalInvestigator(ds, _, { cachedGetEntityById, isAdmin, user }: Context) {
    const dataset = await cachedGetEntityById(DatasetModel, ds._source.ds_id)
    if (dataset == null) {
      logger.warn(`Elasticsearch DS does not exist in DB: ${ds._source.ds_id}`)
      return null
    }
    const canSeePiEmail = isAdmin || (user.id === ds._source.ds_submitter_id)
    if (dataset.piName) {
      return {
        name: dataset.piName,
        email: canSeePiEmail ? dataset.piEmail : null,
      }
    }
    return null
  },

  analyzer(ds) {
    const msInfo = ds._source.ds_meta.MS_Analysis
    return {
      type: msInfo.Analyzer,
      rp: msInfo.Detector_Resolving_Power,
    }
  },

  status(ds) {
    return ds._source.ds_status
  },

  inputPath(ds) {
    return ds._source.ds_input_path
  },

  uploadDateTime(ds) {
    return ds._source.ds_upload_dt
  },

  async annotationCounts(ds, { inpFdrLvls }: { inpFdrLvls: number[] }, ctx) {
    const counts = []
    if (ds._source.annotation_counts && ds._source.ds_status === 'FINISHED') {
      const visibleDatabaseIds = await ctx.user.getVisibleDatabaseIds()
      const annotCounts: any[] = ds._source.annotation_counts.filter(
        el => ds._source.ds_moldb_ids?.includes(el.db.id)
              && visibleDatabaseIds.includes(el.db.id)
      )
      for (const el of annotCounts) {
        const filteredFdrLevels = el.counts.filter((lvlObj: any) => inpFdrLvls.includes(lvlObj.level))
        const database = await ctx.entityManager.getCustomRepository(MolecularDbRepository)
          .findDatabaseById(ctx, el.db.id)
        counts.push({
          databaseId: el.db.id,
          dbName: database.name,
          dbVersion: database.version,
          counts: filteredFdrLevels,
        })
      }
    }

    return counts
  },

  async fdrCounts(ds, { inpFdrLvls, checkLvl }: { inpFdrLvls: number[], checkLvl: number }, ctx) {
    let outFdrLvls: number[] = []; let outFdrCounts: number[] = []; let maxCounts = 0; let databaseId = null
    if (ds._source.annotation_counts && ds._source.ds_status === 'FINISHED') {
      const visibleDatabaseIds = await ctx.user.getVisibleDatabaseIds()
      const annotCounts: any[] = ds._source.annotation_counts.filter(
        el => ds._source.ds_moldb_ids?.includes(el.db.id)
          && visibleDatabaseIds.includes(el.db.id)
      )
      for (const el of annotCounts) {
        const maxCountsCand = el.counts.find((lvlObj: any) => {
          return lvlObj.level === checkLvl
        })
        if (maxCountsCand.n >= maxCounts) {
          maxCounts = maxCountsCand.n
          outFdrLvls = []
          outFdrCounts = []
          for (const inpLvl of inpFdrLvls) {
            const findRes = el.counts.find((lvlObj: any) => {
              return lvlObj.level === inpLvl
            })
            if (findRes) {
              databaseId = el.db.id
              outFdrLvls.push(findRes.level)
              outFdrCounts.push(findRes.n)
            }
          }
        }
      }
      if (databaseId != null) {
        const database = await ctx.entityManager.getCustomRepository(MolecularDbRepository)
          .findDatabaseById(ctx, databaseId)
        return {
          databaseId: databaseId,
          dbName: database.name,
          dbVersion: database.version,
          levels: outFdrLvls,
          counts: outFdrCounts,
        }
      }
    }
    return null
  },

  // TODO: field is deprecated, remove
  async opticalImage(ds, _, ctx) {
    const opticalImage = await rawOpticalImage(ds._source.ds_id, ctx)
    return opticalImage ? opticalImage.url : null
  },

  async rawOpticalImageUrl(ds, _, ctx) {
    const opticalImage = await rawOpticalImage(ds._source.ds_id, ctx)
    return opticalImage ? opticalImage.url : null
  },

  async thumbnailOpticalImageUrl(ds, args, ctx) {
    return await thumbnailOpticalImageUrl(ctx, ds._source.ds_id)
  },

  async opticalImages(ds, { type }: { type?: string }, ctx) {
    const opticalImages = await getOpticalImagesByDsId(ctx, ds._source.ds_id)
    return type != null
      ? opticalImages.filter(optImg => optImg.type === type)
      : opticalImages
  },

  async opticalImageTransform(ds, args, ctx) {
    const datasetRow = await getDbDatasetById(ctx, ds._source.ds_id)
    return datasetRow != null ? datasetRow.transform : null
  },

  async ionThumbnailUrl(ds, args, ctx) {
    const result = await getDbDatasetById(ctx, ds._source.ds_id)
    return result?.ion_thumbnail_url ?? null
  },

  async externalLinks(ds, args, ctx) {
    const dbDs = await getDbDatasetById(ctx, ds._source.ds_id)
    return dbDs && dbDs.external_links || []
  },

  async canEdit(ds, args, ctx) {
    return await canEditEsDataset(ds, ctx)
  },

  async canDelete(ds, args, ctx) {
    return await canDeleteEsDataset(ds, ctx)
  },

  async canDownload(ds, args, ctx) {
    return await canDownloadDataset(ds, ctx)
  },

  async downloadLinkJson(ds, args, ctx) {
    if (await canDownloadDataset(ds, ctx)) {
      const parsedPath = /s3a:\/\/([^/]+)\/(.*)/.exec(ds._source.ds_input_path)
      let files: { filename: string, link: string }[]
      if (parsedPath != null) {
        const [, bucket, prefix] = parsedPath
        const s3 = getS3Client()
        const objects = await s3.listObjectsV2({
          Bucket: bucket,
          Prefix: prefix,
        }).promise()
        let fileKeys = (objects.Contents || [])
          .map(obj => obj.Key!)
          .filter(key => key && /(\.imzml|.ibd|.mzml)$/i.test(key))

        // Put the .imzML/.mzml file first
        fileKeys = _.sortBy(fileKeys, a => a.toLowerCase().endsWith('mzml') ? 0 : 1)

        files = fileKeys.map(key => ({
          filename: key.replace(/.*\//, ''),
          link: s3.getSignedUrl('getObject', { Bucket: bucket, Key: key, Expires: 1800 }),
        }))
      } else {
        files = []
      }

      return JSON.stringify({
        contributors: [
          { name: ds._source.ds_submitter_name, institution: ds._source.ds_group_name },
        ],
        license: ds._source.ds_is_public
          ? {
              code: 'CC BY 4.0',
              name: 'Creative Commons Attribution 4.0 International Public License',
              link: 'https://creativecommons.org/licenses/by/4.0/',
            }
          : {
              code: 'NO-LICENSE',
              name: 'No license was specified. No permission to download or use these files has been given. '
              + 'Seek permission from the author before downloading these files.',
              link: 'https://choosealicense.com/no-permission/',
            },
        files,
      })
    } else {
      return null
    }
  },

  async diagnostics(ds: DatasetSource, args: any, ctx: Context) {
    const dataloader = ctx.contextCacheGet('Dataset.diagnosticsDataLoader', [], () => {
      return new DataLoader(async(datasetIds: string[]) => {
        const results = await ctx.entityManager.find(DatasetDiagnosticModel, {
          where: {
            datasetId: In(datasetIds),
            error: IsNull(),
          },
          relations: ['job'],
        })
        const molDbRepository = ctx.entityManager.getCustomRepository(MolecularDbRepository)

        const formattedResults = await Promise.all(results.map(async diag => {
          let database = null
          // If user isn't allowed to see the moldb, don't let them see the diagnostic
          if (diag.job != null) {
            try {
              database = await molDbRepository.findDatabaseById(ctx, diag.job.moldbId)
            } catch {
              return null
            }
          }
          return {
            ...diag,
            data: JSON.stringify(diag.data),
            database,
            updatedDT: diag.updatedDT.toISOString(),
          }
        }))

        const keyedResults = _.groupBy(formattedResults.filter(d => d != null), 'datasetId')
        return datasetIds.map(id => keyedResults[id] || [])
      })
    })
    return await dataloader.load(ds._source.ds_id)
  },

  async scoringModel(ds: DatasetSource, args, ctx: Context): Promise<ScoringModel | null> {
    const name = ds._source.ds_config?.fdr?.scoring_model
    if (name) {
      return await ctx.contextCacheGet('getScoringModelByName', [name], async name => {
        return ctx.entityManager.findOneOrFail(ScoringModelModel, { where: { name } })
      })
    } else {
      return null
    }
  },
}

export default DatasetResolvers
