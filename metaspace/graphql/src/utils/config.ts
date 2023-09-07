import * as config from 'config'
import { IConfig } from 'config'
import { Algorithm } from 'jsonwebtoken'
import { Config as AWSConfig, S3 } from 'aws-sdk/index.d'

export type ImageStorageType = 'fs';
export interface ImageCategoryConfig {
  type: string,
  path: string,
  storage_types: ImageStorageType[],
}

export type ImageCategory = 'iso_image' | 'optical_image' | 'raw_optical_image' | 'ion_thumbnail';

export interface Adduct {
  adduct: string;
  name: string;
  charge: number;
  hidden: boolean;
  default: boolean;
}

export interface Config {
  port: number;
  ws_port: number;
  img_storage_host: string;
  img_storage_port: number;
  log: {
    level: string;
  };
  adducts: Adduct[];
  img_upload: {
    iso_img_fs_path: string;
    categories: Record<ImageCategory, ImageCategoryConfig>;
  };
  upload: {
    bucket?: string;
    moldb_prefix: string;
    optical_images_prefix: string;
  };
  services: {
    sm_engine_api_host: string;
  };
  db: {
    host: string;
    database: string;
    user: string;
    password: string;
  };
  elasticsearch: {
    dataset_index: string;
    annotation_index: string;
    schema: string;
    host: string;
    port: number;
  };
  rabbitmq: {
    host: string;
    user: string;
    password: string;
  };
  redis: {
    host: string;
    port: string;
  };
  cookie: {
    secret: string;
  };
  google: {
    client_id: string;
    client_secret: string;
    callback_url: string;
    serpapi_key: string;
  };
  web_public_url: string;
  slack: {
    webhook_url: string;
    channel: string;
  };
  jwt: {
    secret: string;
    algorithm: Algorithm;
  };
  uppy: {
    secret: string;
    uploadUrls: string[];
  };
  sentry: {
    dsn: string | null;
    environment?: string;
    release?: string;
  };
  features: {
    graphqlMocks: boolean;
    impersonation: boolean;
    imzmlDownload: boolean;
  };
  aws?: AWSConfig;
  s3?: S3.ClientConfiguration; // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property
  metadataLookups: {
    colocalizationAlgos: [string, string][]; // code, name
    defaultColocalizationAlgo: string;
  };
}

const _config = config as any as (Config & IConfig)

export default _config
