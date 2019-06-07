module.exports = {
  port: 3010,
  ws_port: 5666,
  img_storage_port: 4201,

  web_public_url: 'http://localhost:8888',

  log: {
    level: 'debug',
  },

  defaults: {
    adducts: {"+": ["+H", "+Na", "+K"], "-": ["-H", "+Cl"]},
    moldb_names: ['HMDB-v4']
  },

  /* Settings for image storage.
     It's currently co-hosted with the GraphQL server. */
  img_upload: {
    iso_img_fs_path: "/opt/data/sm_data/public/",
    categories: {
      iso_image: {
        type: 'image/png',
        path: '/iso_images/',
        storage_types: ['fs', 'db']
      },
      optical_image: {
        type: 'image/jpeg',
        path: '/optical_images/',
        storage_types: ['fs']
      },
      raw_optical_image: {
        type: 'image/jpeg',
        path: '/raw_optical_images/',
        storage_types: ['fs']
      },
      ion_thumbnail: {
        type: 'image/png',
        path: '/ion_thumbnails',
        storage_types: ['fs'],
      }
    }
  },

  services: {
    /* Molecular database service, used only for internal purposes (peakChartData query) */
    moldb_service_host: "localhost:5001",
    /* Internal ad-hoc service with the only endpoint /reindex/:dataset_id */
    sm_engine_api_host: "localhost:5123",
  },

  db: {
    host: 'localhost',
    database: 'sm',
    user: 'sm',
    password: 'sm',
  },

  elasticsearch: {
    host: 'localhost',
    port: 9200,
    index: 'sm',
  },

  rabbitmq: {
    host: 'localhost',
    username: 'sm',
    password: 'sm',
  },

  redis: {
    host: 'localhost',
    port: 6379,
  },

  cookie: {
    secret: 'secret',
  },

  jwt: {
    secret: 'secret',
    algorithm: 'HS256',
  },

  sentry: {
    dsn: null,
  },

  google: {
    client_id: '',
    client_secret: '',
    callback_url: 'http://localhost:8888/api_auth/google/callback'
  },

  slack: {
    webhook_url: '',
    channel: '',
  },

  aws: {
    aws_access_key_id: '',
    aws_secret_access_key: '',
    aws_region: 'eu-west-1',
  },

  features: {
    graphqlMocks: false,
    impersonation: false,
  },

  metadataLookups: {
    colocalizationAlgos: [
      ['cosine', 'Cosine distance'],
      ['pca_cosine', 'PCA + Cosine distance'],
      ['pca_pearson', 'PCA + Pearson correlation'],
      ['pca_spearman', 'PCA + Spearman correlation'],
    ],
    defaultColocalizationAlgo: 'cosine',
  },
};
