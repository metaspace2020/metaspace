import ExperimentRegionResolvers from './ExperimentRegion'
import { Roi, Segmentation } from '../../engine/model'

describe('ExperimentRegion field resolvers', () => {
  const makeCtx = (handlers: { roi?: any; segmentation?: any } = {}) => {
    const repos = new Map<any, any>()
    repos.set(Roi, { findOne: jest.fn().mockResolvedValue(handlers.roi) })
    repos.set(Segmentation, { findOne: jest.fn().mockResolvedValue(handlers.segmentation) })
    return {
      entityManager: {
        getRepository: (entity: any) => repos.get(entity),
      },
    } as any
  }

  describe('roi', () => {
    it('returns null when roiId is missing', async() => {
      const ctx = makeCtx({})
      const result = await (ExperimentRegionResolvers.roi as any)(
        { regionKey: 'r1', sourceKind: 'whole', roiId: null }, {}, ctx)
      expect(result).toBeNull()
    })

    it('looks up Roi by stringified id', async() => {
      const expected = { id: '12345', name: 'Tumor', geojson: { type: 'Polygon' } }
      const ctx = makeCtx({ roi: expected })
      const result = await (ExperimentRegionResolvers.roi as any)(
        { regionKey: 'r1', sourceKind: 'roi', roiId: 12345 }, {}, ctx)
      expect(result).toEqual(expected)
      expect(ctx.entityManager.getRepository(Roi).findOne).toHaveBeenCalledWith('12345')
    })

    it('returns null when Roi is not found', async() => {
      const ctx = makeCtx({ roi: undefined })
      const result = await (ExperimentRegionResolvers.roi as any)(
        { regionKey: 'r1', sourceKind: 'roi', roiId: 99 }, {}, ctx)
      expect(result).toBeNull()
    })
  })

  describe('segmentation', () => {
    it('returns null when segmentationId is missing', async() => {
      const ctx = makeCtx({})
      const result = await (ExperimentRegionResolvers.segmentation as any)(
        { regionKey: 'r1', sourceKind: 'whole', segmentationId: null }, {}, ctx)
      expect(result).toBeNull()
    })

    it('looks up Segmentation by uuid', async() => {
      const segId = '11111111-2222-3333-4444-555555555555'
      const expected = { id: segId, segmentIndex: 2, name: 'cluster-2' }
      const ctx = makeCtx({ segmentation: expected })
      const result = await (ExperimentRegionResolvers.segmentation as any)(
        { regionKey: 'r1', sourceKind: 'segmentation_cluster', segmentationId: segId }, {}, ctx)
      expect(result).toEqual(expected)
      expect(ctx.entityManager.getRepository(Segmentation).findOne).toHaveBeenCalledWith(segId)
    })

    it('returns null when Segmentation is not found', async() => {
      const ctx = makeCtx({ segmentation: undefined })
      const parent = {
        regionKey: 'r1',
        sourceKind: 'segmentation_cluster',
        segmentationId: '11111111-2222-3333-4444-555555555555',
      }
      const result = await (ExperimentRegionResolvers.segmentation as any)(parent, {}, ctx)
      expect(result).toBeNull()
    })
  })
})
