import * as Amqplib from 'amqplib';
import {esDatasetByID} from '../../../../esConnector';
import {canUserViewPgDataset, logger, pubsub, wait} from '../../../../utils';
import config from '../../../utils/config';
import {DatasetStatus, EngineDataset} from '../model';
import {Context} from '../../../context';
import {fetchEngineDS} from '../../../utils/knexDb';

interface DatasetStatusUpdatePayload {
  dataset?: any;
  dbDs?: EngineDataset;
}

async function publishDatasetStatusUpdate(ds_id: string, status: DatasetStatus) {
  // wait until updates are reflected in ES so that clients can refresh their data
  const maxAttempts = 5;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log({attempt, status});
      const ds = await esDatasetByID(ds_id, null);

      if (ds === null && status === 'DELETED') {
        await wait(1000);
        pubsub.publish('datasetStatusUpdated', {});
        return;
      } else if (ds !== null && status !== 'DELETED') {
        pubsub.publish('datasetStatusUpdated', {
          dataset: Object.assign({}, ds, { status }),
          dbDs: await fetchEngineDS({ id: ds_id })
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
        const { ds_id, status } = JSON.parse(msg.content.toString());
        if (['QUEUED', 'ANNOTATING', 'FINISHED', 'FAILED', 'DELETED'].indexOf(status) >= 0)
          publishDatasetStatusUpdate(ds_id, status).then(/* Ignore promise - allow to run in background */);
        ch.ack(msg);
      }
    });
  });
}).catch(console.warn);

const SubscriptionResolvers = {
  datasetStatusUpdated: {
    subscribe: () => pubsub.asyncIterator('datasetStatusUpdated'),
    resolve: (payload: DatasetStatusUpdatePayload, args: {}, context: Context) => {
      if (payload.dataset && payload.dbDs && canUserViewPgDataset(payload.dbDs, context.user)) {
        return { dataset: payload.dataset };
      } else {
        // Empty payload indicates that the client should still refresh its dataset list
        return { dataset: null };
      }
    }
  },
};

export default SubscriptionResolvers;
