const fileConfig = require('./clientConfig.json');
import {defaultsDeep} from 'lodash-es';


interface AWSConfig {
  access_key_id: string;
  region: string;
  s3_bucket: string;
  s3_signature_endpoint: string;
  s3_signature_version: number;
}

interface FineUploaderConfigS3 {
  storage: 's3';
  aws: AWSConfig;
}

interface FineUploaderConfigLocal {
  storage: 'local';
}

type FineUploaderConfig = FineUploaderConfigS3 | FineUploaderConfigLocal;

interface Features {
  coloc: boolean;
}

interface ClientConfig {
  graphqlUrl: string | null;
  wsGraphqlUrl: string | null;

  google_client_id: string;

  fineUploader: FineUploaderConfig;
  ravenDsn: string | null;
  metadataTypes: string[];
  features: Features;
}

const defaultConfig: ClientConfig = {
  graphqlUrl: null,
  wsGraphqlUrl: null,
  google_client_id: '',
  fineUploader: {
    storage: 'local'
  },
  ravenDsn: null,
  metadataTypes: ["ims"],
  features: {
    coloc: false,
  }
};

let config = defaultsDeep({}, fileConfig, defaultConfig) as ClientConfig;

export const updateConfigFromQueryString = () => {
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    // hackily parse the querystring because vue-router hasn't initialized yet and IE doesn't support the
    // URLSearchParams class that can do this properly
    window.location.search
      .substring(1)
      .split('&')
      .filter(part => part.startsWith('feat='))
      .forEach(features => {
        features.substring('feat='.length)
          .split(',')
          .forEach(feat => {
            const val = !feat.endsWith('-');
            const key = val ? feat : feat.substring(0, feat.length - 1);
            (config.features as any)[key] = val;
          });
      });
  }
};

export const replaceConfigWithDefaultForTests = () => {
  config = defaultsDeep({}, defaultConfig);
};

export default config;
