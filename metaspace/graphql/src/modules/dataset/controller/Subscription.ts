import * as Amqplib from 'amqplib';
import {esDatasetByID} from '../../../../esConnector';
import {logger, wait} from '../../../../utils';
import config from '../../../utils/config';
import {DatasetStatus} from '../model';
import {Context} from '../../../context';
import canViewEsDataset from '../util/canViewEsDataset';
import {relationshipToDataset} from '../util/relationshipToDataset';
import {
  asyncIterateDatasetDeleted,
  asyncIterateDatasetStatusUpdated,
  publishDatasetDeleted,
  publishDatasetStatusUpdated,
} from '../../../utils/pubsub';

/** From `DaemonAction` in sm-engine, but capitalized */
type EngineDatasetAction = 'ANNOTATE' | 'UPDATE' | 'INDEX' | 'DELETE';
/** From `DaemonActionStage` in sm-engine */
type EngineDatasetActionStage = 'QUEUED' | 'STARTED' | 'FINISHED' | 'FAILED';


interface DatasetStatusPayload {
  ds_id: string;
  status: DatasetStatus | null;
  action: EngineDatasetAction;
  stage: EngineDatasetActionStage;
  is_new?: boolean;
}

async function waitForChangeAndPublish(payload: DatasetStatusPayload) {
  const {ds_id, status, action, stage, ...rest} = payload;
  // wait until updates are reflected in ES so that clients can refresh their data
  const maxAttempts = 5;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      logger.debug(JSON.stringify({attempt, status}));
      const ds = await esDatasetByID(ds_id, null, true);

      if (action === 'DELETE' && stage === 'FINISHED') {
        if (ds == null) {
          await wait(1000);
          publishDatasetDeleted({ id: ds_id });
          return;
        }
      } else if (ds != null) {
        publishDatasetStatusUpdated({
          dataset: {
            ...ds,
            _source: {
              ...ds._source,
            }
          },
          action,
          stage,
          ...rest,
        });
        return;
      }

      await wait(50 * attempt * attempt);
    }
  } catch (err) {
    logger.error(err);
  }

  logger.warn(`Failed to propagate dataset update for ${ds_id}`);
}

(async () => {
  try {
    const RABBITMQ_CHANNEL = 'sm_dataset_status';
    const conn = await Amqplib.connect(`amqp://${config.rabbitmq.user}:${config.rabbitmq.password}@${config.rabbitmq.host}`);
    const ch = await conn.createChannel();
    await ch.assertQueue(RABBITMQ_CHANNEL);
    await ch.consume(RABBITMQ_CHANNEL, msg => {
      if (msg != null) {
        try {
          waitForChangeAndPublish(JSON.parse(msg.content.toString()))
            .then(/* Ignore promise - allow to run in background */);
        } finally {
          ch.ack(msg);
        }
      }
    });
  } catch (err) {
    console.error(err);
  }
})();


const SubscriptionResolvers = {
  datasetStatusUpdated: {
    subscribe: (source: any, args: any, context: Context) => {
      const iterator = asyncIterateDatasetStatusUpdated();
      // This asyncIterator is manually implemented because there is a weird interaction between TypeScript and iterall.
      // Somehow `iterator.return()` doesn't get called. I suspect iterall doesn't recognize TypeScript's asyncIterators
      // and this leads to them not having `iterator.return()` called after execution. It also seems like TypeScript
      // doesn't correctly execute code in the `finally` block if a try-finally block is put around the for-await loop.
      // This shows up as memory leak warnings after a certain number of subscriptions, even if they have all
      // correctly unsubscribed.
      return {
        [Symbol.asyncIterator]() {
          return this;
        },
        async next() {
          while (true) {
            const { value, done } = await iterator.next();
            if (done) {
              return {done}
            }
            if (value.dataset && await canViewEsDataset(value.dataset, context.user)) {
              const relationships = await relationshipToDataset(value.dataset, context);
              const payload = {
                is_new: null,
                ...value,
                relationship: relationships.length > 0 ? relationships[0] : null,
              };
              return { value: payload, done: false };
            }
          }
        },
        throw(err?: any) {
          return iterator.throw && iterator.throw(err);
        },
        return() {
          return iterator.return && iterator.return();
        }
      }
    },
    // subscribe: async function* datasetStatusUpdated(source: any, args: any, context: Context) {
    //   for await (const payload of asyncIterateDatasetStatusUpdated()) {
    //     if (payload.dataset && canViewEsDataset(payload.dataset, context.user)) {
    //       const relationships = await relationshipToDataset(payload.dataset, context);
    //       yield {
    //         is_new: null,
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
  }
};

export default SubscriptionResolvers;
