module.exports = {
  port: 3010,
  ws_port: 5666,
  img_storage_host: 'localhost',
  img_storage_port: 4201,

  web_public_url: 'http://localhost:8888',

  log: {
    level: 'debug',
  },

  adducts: [
    // Positive mode
    { adduct: '+H', name: '[M + H]⁺', charge: 1, hidden: false, default: true },
    { adduct: '+Na', name: '[M + Na]⁺', charge: 1, hidden: false, default: true },
    { adduct: '+K', name: '[M + K]⁺', charge: 1, hidden: false, default: true },
    { adduct: '[M]+', name: '[M]⁺', charge: 1, hidden: false, default: false },
    { adduct: '+NH4', name: '[M + NH₄]⁺', charge: 1, hidden: false, default: false },
    // Negative mode
    { adduct: '-H', name: '[M - H]⁻', charge: -1, hidden: false, default: true },
    { adduct: '+Cl', name: '[M + Cl]⁻', charge: -1, hidden: false, default: true },
    { adduct: '[M]-', name: '[M]⁻', charge: -1, hidden: false, default: false },
  ],

  /* Settings for image storage.
     It's currently co-hosted with the GraphQL server. */
  img_upload: {
    iso_img_fs_path: '/opt/data/metaspace/public/',
    categories: {
      raw_optical_image: {
        type: 'image/jpeg',
        path: '/raw_optical_images/',
        storage_types: ['fs'],
      },
    },
  },

  upload: {
    bucket: '',
    moldb_prefix: 'databases',
    optical_image_prefix: 'optical_images',
  },

  services: {
    /* Internal ad-hoc service with /v1/datasets and /v1/isotopic_patterns endpoints */
    sm_engine_api_host: 'localhost:5123',
  },

  db: {
    host: 'localhost',
    database: 'sm',
    user: 'sm',
    password: 'sm',
  },

  elasticsearch: {
    schema: 'http',
    host: 'localhost',
    port: 9200,
    dataset_index: 'dataset',
    annotation_index: 'annotation',
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

  uppy: {
    secret: 'secretUppy',
    uploadUrls: [/^http(s){0,1}:\/\/(.+\.)*metaspace2020\.eu\/.*/],
  },

  sentry: {
    dsn: null,
    environment: 'default',
  },

  google: {
    client_id: '',
    client_secret: '',
    recaptcha_secret: '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe',
    callback_url: 'http://localhost:8888/api_auth/google/callback',
  },

  slack: {
    webhook_url: '',
    channel: '',
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
}
