import { applyQueryFilters } from '../queryFilters'
import { esAnnotationByID, esCountResults, esSearchResults, esRawAggregationResults } from '../../../../esConnector'
import { FieldResolversFor } from '../../../bindingTypes'
import { Query } from '../../../binding'

const QueryResolvers: FieldResolversFor<Query, void> = {
  async allAnnotations(source, args, ctx) {
    const { postprocess, args: newArgs } = await applyQueryFilters(ctx, args)
    let annotations = await esSearchResults(newArgs, 'annotation', ctx.user)

    if (postprocess != null) {
      annotations = postprocess(annotations)
    }

    return annotations
  },

  async allAggregatedAnnotations(source, args, ctx) {
    const { args: newArgs } = await applyQueryFilters(ctx, args)
    const aggAnnotations = await esRawAggregationResults(newArgs, {
      unique_formulas: {
        terms: {
          field: 'ion',
          size: 1000000, // given ES agg pagination lacking, here we need a big number to return everything
        },
        aggs: {
          unique_db_ids: {
            terms: {
              field: 'db_id',
            },
            aggs: {
              unique_ds_ids: {
                terms: {
                  field: 'ds_id',
                },
                aggs: {
                  include_source: {
                    top_hits: {
                      _source: {},
                    },
                  },
                },
              },
            },
          },
        },
      },
    }, 'annotation', ctx.user)

    const auxObj : any[] = []

    aggAnnotations.unique_formulas.buckets.forEach((agg:any) => {
      agg.unique_db_ids.buckets.forEach((db: any) => {
        const item : {
          ion : string
          dbId: string
          datasetIds: string[]
          annotations: any[]
        } | any = {}
        item.ion = agg.key
        item.dbId = db.key
        item.datasetIds = []
        item.annotations = []
        db.unique_ds_ids.buckets.forEach((ds: any) => {
          item.datasetIds.push(ds.key)
          item.annotations.push(ds.include_source.hits.hits[0])
        })
        auxObj.push(item)
      })
    })
    return auxObj
  },

  async countAnnotations(source, args, ctx) {
    const { args: newArgs } = await applyQueryFilters(ctx, args)

    return await esCountResults(newArgs, 'annotation', ctx.user)
  },

  async annotation(_, { id }, ctx) {
    return await esAnnotationByID(id, ctx.user)
  },
}
export default QueryResolvers
