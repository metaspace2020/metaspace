module.exports = {
  port: 3010,
  ws_port: 5666,
  img_storage_port: 4201,

  web_public_url: 'http://localhost:8888',

  log: {
    level: 'debug',
  },

  adducts: [
    // Positive mode
    { adduct: "+H", name: "[M + H]⁺", charge: 1, hidden: false, default: true },
    { adduct: "+Na", name: "[M + Na]⁺", charge: 1, hidden: false, default: true },
    { adduct: "+K", name: "[M + K]⁺", charge: 1, hidden: false, default: true },
    { adduct: "[M]+", name: "[M]⁺", charge: 1, hidden: true, default: false },
    { adduct: "+NH4", name: "[M + NH₄]⁺", charge: 1, hidden: true, default: false },
    // Negative mode
    { adduct: "-H", name: "[M - H]⁻", charge: -1, hidden: false, default: true },
    { adduct: "+Cl", name: "[M + Cl]⁻", charge: -1, hidden: false, default: true },
    { adduct: "[M]-", name: "[M]⁻", charge: -1, hidden: true, default: false },
  ],

  /* Settings for image storage.
     It's currently co-hosted with the GraphQL server. */
  img_upload: {
    iso_img_fs_path: "/opt/data/metaspace/public/",
    categories: {
      iso_image: {
        type: 'image/png',
        path: '/iso_images/',
        storage_types: ['fs']
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

  upload: {
    endpoint: '',
    access_key_id: '',
    secret_access_key:'',
    bucket: '',
    moldbPrefix: 'databases'
  },

  services: {
    /* Internal ad-hoc service with /v1/datasets and /v1/isotopic_patterns endpoints */
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
    environment: "default",
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
    imzmlDownload: false,
  },

  metadataLookups: {
    colocalizationAlgos: [
      ['median_thresholded_cosine', 'Median-thresholded cosine distance'],
      ['cosine', 'Cosine distance'],
    ],
    defaultColocalizationAlgo: 'median_thresholded_cosine',
  },
};
