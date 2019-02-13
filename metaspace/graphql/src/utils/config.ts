import * as config from 'config';
import { IConfig } from 'config';

export interface ImageCategoryConfig {
  type: string,
  path: string,
  storage_types: string[],
}

export interface Config {
  port: number;
  ws_port: number;
  img_storage_port: number;
  log: {
    level: string;
  };
  defaults: {
    adducts: string[];
    moldb_names: string[];
  };
  img_upload: {
    iso_img_fs_path: string;
  };
  categories: {
    iso_image: ImageCategoryConfig;
    optical_image: ImageCategoryConfig;
    raw_optical_image: ImageCategoryConfig;
  };
  services: {
    moldb_service_host: string;
    sm_engine_api_host: string;
  };
  db: {
    host: string;
    database: string;
    user: string;
    password: string;
  };
  elasticsearch: {
    index: string;
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
  };
  web_public_url: string;
  slack: {
    webhook_url: string;
    channel: string;
  };
  jwt: {
    secret: string;
  };
  features: {
    graphqlMocks: boolean;
    impersonation: boolean;
  };
  aws:  {
    aws_access_key_id: string;
    aws_secret_access_key: string;
    aws_region: string;
  };
  metadataLookups: {
    colocalizationAlgos: Record<string, string>;
    defaultColocalizationAlgo: string;
  };
}

const _config = config as any as (Config & IConfig);

export default _config;
