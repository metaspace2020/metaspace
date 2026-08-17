import { UserError } from 'graphql-errors'
import * as moment from 'moment'
import { DatasetSource } from '../../../bindingTypes'
import { Context } from '../../../context'
import canEditEsDataset from './canEditEsDataset'
import { smApiJsonPost } from '../../../utils/smApi/smApiCall'

/**
 * ROIs smaller than this cannot produce a usable dataset — chaos and spatial metrics have no
 * structure to measure and FDR is estimated from too few surviving annotations — so they are
 * refused. Between the two thresholds the dialog warns but lets the user proceed.
 * Mirrors MIN_ROI_PIXELS / WARN_ROI_PIXELS in sm/engine/dataset_split_runner.py.
 */
export const MIN_ROI_PIXELS = 500
export const WARN_ROI_PIXELS = 2000

export interface RoiSplitStats {
  roiId: string;
  name: string;
  isDefault: boolean;
  nPixels: number;
  blocked: boolean;
  warning: boolean;
}

/**
 * Splitting copies a dataset's raw files into the requester's own account, so the gate is the
 * dataset's licence rather than its edit permissions: public datasets are CC BY 4.0 (see the
 * `license` resolver in controller/Dataset.ts), while a privately-shared dataset carries no
 * permission to copy its files, no matter who can view it.
 */
export const canSplitDataset = async(dataset: DatasetSource, ctx: Context): Promise<boolean> => {
  if (ctx.user.id == null) {
    return false
  }
  return dataset._source.ds_is_public === true || await canEditEsDataset(dataset, ctx)
}

export const assertCanSplitDataset = async(dataset: DatasetSource, ctx: Context) => {
  if (!await canSplitDataset(dataset, ctx)) {
    throw new UserError(JSON.stringify({
      type: 'no_permission',
      hint: 'This dataset is not public and you do not have permission to edit it, so its raw '
        + 'files may not be copied.',
    }))
  }
}

/**
 * Per-ROI pixel counts from sm-engine, which measures them against the dataset's stored TIC image —
 * the same grid the ROI polygons are drawn on, so these counts match what the split will select.
 * The dialog and the mutation both use this, so the size guard has a single source of truth.
 */
export const fetchRoiSplitStats = async(
  datasetId: string, roiIds?: string[]
): Promise<RoiSplitStats[]> => {
  const { content } = await smApiJsonPost('/v1/split/roi-stats', {
    ds_id: datasetId,
    roi_ids: roiIds != null ? roiIds.map(id => parseInt(id, 10)) : null,
  })
  if (content?.status !== 'success') {
    throw new UserError('Could not read the ROIs of this dataset. It may need reprocessing first.')
  }
  return (content.rois || []).map((roi: any) => ({
    roiId: String(roi.roi_id),
    name: roi.name,
    isDefault: roi.is_default,
    nPixels: roi.n_pixels,
    blocked: roi.blocked,
    warning: roi.warning,
  }))
}

/**
 * A dataset id is a timestamp with second resolution (see newDatasetId in controller/Mutation.ts),
 * so creating several children in one call would collide unless each id is checked and, on a
 * clash, nudged forward a second.
 */
export const generateChildDatasetIds = async(
  count: number, exists: (id: string) => Promise<boolean>
): Promise<string[]> => {
  const ids: string[] = []
  const candidate = moment()
  // Bounded so a pathological run of taken ids can't spin forever.
  const limit = count + 600
  for (let attempt = 0; attempt < limit && ids.length < count; attempt++) {
    const id = `${candidate.format('YYYY-MM-DD')}_${candidate.format('HH')}h`
      + `${candidate.format('mm')}m${candidate.format('ss')}s`
    if (!ids.includes(id) && !await exists(id)) {
      ids.push(id)
    }
    candidate.add(1, 'second')
  }
  if (ids.length < count) {
    throw new UserError('Could not allocate dataset ids for the split. Please try again.')
  }
  return ids
}
