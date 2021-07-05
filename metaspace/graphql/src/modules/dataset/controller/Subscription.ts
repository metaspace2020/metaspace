import * as Amqplib from 'amqplib'
import * as Sentry from '@sentry/node'
import { esDatasetByID } from '../../../../esConnector'
import logger from '../../../utils/logger'
import wait from '../../../utils/wait'
import config from '../../../utils/config'
import { ContextUser, BaseContext, AuthMethodOptions } from '../../../context'
import canViewEsDataset from '../operation/canViewEsDataset'
import { relationshipToDataset } from '../operation/relationshipToDataset'
import {
  asyncIterateDatasetDeleted,
  asyncIterateDatasetStatusUpdated,
  publishDatasetDeleted,
  publishDatasetStatusUpdated,
} from '../../../utils/pubsub'
import * as moment from 'moment'

/** From `DaemonAction` in sm-engine, but capitalized */
type EngineDatasetAction = 'ANNOTATE' | 'UPDATE' | 'INDEX' | 'DELETE';
const KNOWN_ACTIONS = ['ANNOTATE', 'UPDATE', 'INDEX', 'DELETE']
/** From `DaemonActionStage` in sm-engine */
type EngineDatasetActionStage = 'QUEUED' | 'STARTED' | 'FINISHED' | 'FAILED';

interface DatasetStatusPayload {
  ds_id: string;
  action: EngineDatasetAction;
  stage: EngineDatasetActionStage;
  isNew?: boolean;
}

const dummyContextUser: ContextUser = {
  role: 'guest',
  authMethod: AuthMethodOptions.UNKNOWN,
  getProjectRoles: () => { return Promise.resolve({}) },
  getMemberOfGroupIds: () => { return Promise.resolve([]) },
  getMemberOfProjectIds: () => { return Promise.resolve([]) },
  getVisibleDatabaseIds: () => { return Promise.resolve([]) },
}

async function waitForChangeAndPublish(payload: DatasetStatusPayload) {
  const { ds_id, action: rawAction, stage, ...rest } = payload
  const action = (rawAction || '').toUpperCase() as EngineDatasetAction
  // wait until updates are reflected in ES so that clients can refresh their data
  const maxAttempts = 12

  if (!KNOWN_ACTIONS.includes(action)) {
    return
  }

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      logger.debug('Pushing status update to subscribers: ' + JSON.stringify({ attempt, ...payload }))
      const ds = await esDatasetByID(ds_id, dummyContextUser, true)

      if (action === 'DELETE' && stage === 'FINISHED') {
        if (ds == null) {
          await wait(1000)
          await publishDatasetDeleted({ id: ds_id })
          return
        }
      } else if (ds != null) {
        await publishDatasetStatusUpdated({
          dataset: {
            ...ds,
            _source: {
              ...ds._source,
            },
          },
          action,
          stage,
          ...rest,
        })
        return
      }

      await wait(50 * attempt * attempt)
    }
  } catch (err) {
    logger.error(err)
    Sentry.captureException(err)
  }

  logger.warn(`Failed to propagate dataset update for ${ds_id}`)
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async() => {
  try {
    const RABBITMQ_CHANNEL = 'sm_dataset_status'
    const conn = await Amqplib.connect(
      `amqp://${config.rabbitmq.user}:${config.rabbitmq.password}@${config.rabbitmq.host}`
    )
    const ch = await conn.createChannel()
    await ch.assertQueue(RABBITMQ_CHANNEL)
    await ch.consume(RABBITMQ_CHANNEL, msg => {
      if (msg != null) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          waitForChangeAndPublish(JSON.parse(msg.content.toString()))
            .then(/* Ignore promise - allow to run in background */)
        } finally {
          ch.ack(msg)
        }
      }
    })
  } catch (err) {
    console.error(err)
  }
})()

const isDatasetNew = (datasetId: string) => {
  // WORKAROUND: It's useful for the web UI to know whether a dataset was just uploaded, or is being reprocessed.
  // However, this isn't easy to determine in the engine when status update messages are sent, because the dataset has
  // already been inserted into the database. Instead, just guess based on whether the datasetId was generated in the
  // last few minutes
  try {
    const dt = moment(datasetId, 'YYYY-MM-DD_HH[h]mm[m]ss[s]')
    return moment().diff(dt, 'minutes') < 3
  } catch (err) {
    logger.warn(`Could not parse datasetId: ${datasetId}`, err)
    return false
  }
}

const SubscriptionResolvers = {
  datasetStatusUpdated: {
    subscribe: (source: any, args: any, context: BaseContext) => {
      const iterator = asyncIterateDatasetStatusUpdated()
      // This asyncIterator is manually implemented because there is a weird interaction between TypeScript and iterall.
      // Somehow `iterator.return()` doesn't get called. I suspect iterall doesn't recognize TypeScript's asyncIterators
      // and this leads to them not having `iterator.return()` called after execution. It also seems like TypeScript
      // doesn't correctly execute code in the `finally` block if a try-finally block is put around the for-await loop.
      // This shows up as memory leak warnings after a certain number of subscriptions, even if they have all
      // correctly unsubscribed.
      return {
        [Symbol.asyncIterator]() {
          return this
        },
        async next() {
          while (true) {
            const { value, done } = await iterator.next()
            if (done) {
              return { done }
            }
            if (value.dataset && await canViewEsDataset(value.dataset, context.user)) {
              const relationships = await relationshipToDataset(value.dataset, context)
              const payload = {
                isNew: isDatasetNew(value.dataset._source.ds_id),
                ...value,
                relationship: relationships.length > 0 ? relationships[0] : null,
              }
              return { value: payload, done: false }
            }
          }
        },
        throw(err?: any) {
          return iterator.throw && iterator.throw(err)
        },
        return() {
          return iterator.return && iterator.return()
        },
      }
    },
    // subscribe: async function* datasetStatusUpdated(source: any, args: any, context: Context) {
    //   for await (const payload of asyncIterateDatasetStatusUpdated()) {
    //     if (payload.dataset && canViewEsDataset(payload.dataset, context.user)) {
    //       const relationships = await relationshipToDataset(payload.dataset, context);
    //       yield {
    //         isNew: isDatasetNew(value.dataset._source.ds_id),
    //         ...payload,
    //         relationship: relationships.length > 0 ? relationships[0] : null,
    //       };
    //     }
    //   }
    // },
    resolve: (payload: any) => payload,
  },
  datasetDeleted: {
    subscribe: asyncIterateDatasetDeleted,
    resolve: (payload: any) => payload,
  },
}

export default SubscriptionResolvers
