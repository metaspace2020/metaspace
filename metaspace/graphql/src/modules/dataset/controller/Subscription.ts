import * as Amqplib from 'amqplib';
import {esDatasetByID} from '../../../../esConnector';
import {logger, pubsub, wait} from '../../../../utils';
import config from '../../../utils/config';
import {DatasetStatus} from '../model';
import {Context} from '../../../context';
import canViewEsDataset from '../util/canViewEsDataset';
import {relationshipToDataset} from '../util/relationshipToDataset';

interface DatasetStatusUpdatePayload {
  dataset?: any;
  suppressNotification: boolean;
}

async function publishDatasetStatusUpdate(ds_id: string, status: DatasetStatus) {
  // wait until updates are reflected in ES so that clients can refresh their data
  const maxAttempts = 5;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      logger.debug(JSON.stringify({attempt, status}));
      const ds = await esDatasetByID(ds_id, null);

      if (ds == null && status === 'DELETED') {
        await wait(1000);
        pubsub.publish('datasetDeleted', { id: ds_id });
        return;
      } else if (ds != null && status !== 'DELETED') {
        pubsub.publish('datasetStatusUpdated', {
          dataset: {
            ...ds,
            _source: {
              ...ds._source,
              ds_status: status === 'UPDATED' ? 'FINISHED' : status,
            }
          },
          suppressNotification: status === 'UPDATED'
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

let queue = Amqplib.connect(`amqp://${config.rabbitmq.user}:${config.rabbitmq.password}@${config.rabbitmq.host}`);
let rabbitmqChannel = 'sm_dataset_status';
queue.then(function(conn) {
  return conn.createChannel();
}).then(function(ch) {
  return ch.assertQueue(rabbitmqChannel).then(function(ok) {
    return ch.consume(rabbitmqChannel, function(msg) {
      if (msg != null) {
        console.log(msg.content.toString());
        const { ds_id, status } = JSON.parse(msg.content.toString());
        if (['QUEUED', 'ANNOTATING', 'FINISHED', 'FAILED', 'UPDATED', 'DELETED'].indexOf(status) >= 0)
          publishDatasetStatusUpdate(ds_id, status).then(/* Ignore promise - allow to run in background */);
        ch.ack(msg);
      }
    });
  });
}).catch(console.warn);

const SubscriptionResolvers = {
  datasetStatusUpdated: {
    subscribe: async function* datasetStatusUpdated(source: any, args: any, context: Context) {
      // for-await loops need an Iterable, and pubsub.asyncIterator's return value does actually support
      // both interfaces even though its type is "AsyncIterator"
      const iterable = pubsub.asyncIterator('datasetStatusUpdated') as AsyncIterableIterator<DatasetStatusUpdatePayload>;

      for await (const payload of iterable) {
        if (payload.dataset && canViewEsDataset(payload.dataset, context.user)) {
          const relationships = await relationshipToDataset(payload.dataset, context);
          yield {
            dataset: payload.dataset,
            relationship: relationships.length > 0 ? relationships[0] : null,
            suppressNotification: payload.suppressNotification,
          };
        }
      }
    },
    resolve: (payload: any) => payload,
  },
  datasetDeleted: {
    subscribe: () => pubsub.asyncIterator('datasetDeleted'),
    resolve: (payload: any) => payload,
  }
};

export default SubscriptionResolvers;
