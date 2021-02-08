import { ESDataset } from '../../esConnector'
import { PubSub } from 'graphql-subscriptions'
import { SystemHealth, DatasetAction, DatasetActionStage } from '../binding'

interface DatasetDeletedPayload {
  id: string;
}

interface DatasetStatusUpdatedPayload {
  dataset: ESDataset;
  action: DatasetAction;
  stage: DatasetActionStage;
  isNew?: boolean;
}

type SystemHealthPayload = SystemHealth;

const DATASET_DELETED_CHANNEL = 'datasetDeleted'
const DATASET_STATUS_UPDATED_CHANNEL = 'datasetStatusUpdated'
const SYSTEM_HEALTH_UPDATED_CHANNEL = 'systemHealthUpdated'

// pubsub is intentionally not exported - these wrappers exist to help type safety
const pubsub = new PubSub()

export const publishDatasetDeleted = (payload: DatasetDeletedPayload) =>
  pubsub.publish(DATASET_DELETED_CHANNEL, payload)
export const publishDatasetStatusUpdated = (payload: DatasetStatusUpdatedPayload) =>
  pubsub.publish(DATASET_STATUS_UPDATED_CHANNEL, payload)
export const publishSystemHealthUpdated = (payload: SystemHealthPayload) =>
  pubsub.publish(SYSTEM_HEALTH_UPDATED_CHANNEL, payload)

// pubsub.asyncIterator's return type is AsyncIterator, but it actually implements the [Symbol.asyncIterator] property,
// which makes it usable as an AsyncIterable after casting. The AsyncIterable interface is needed for these to be used
// in for-await loops. However, it's important to note that its return value can only be iterated by one consumer,
// because [Symbol.asyncIterator]()'s implementation is just `return this`.
export const asyncIterateDatasetDeleted = () =>
  pubsub.asyncIterator(DATASET_DELETED_CHANNEL) as AsyncIterableIterator<DatasetDeletedPayload>
export const asyncIterateDatasetStatusUpdated = () =>
  pubsub.asyncIterator(DATASET_STATUS_UPDATED_CHANNEL) as AsyncIterableIterator<DatasetStatusUpdatedPayload>
export const asyncIterateSystemHealthUpdated = () =>
  pubsub.asyncIterator(SYSTEM_HEALTH_UPDATED_CHANNEL) as AsyncIterableIterator<DatasetDeletedPayload>
