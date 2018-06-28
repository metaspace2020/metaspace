const config = {
  port: 3010,
  img_storage_port: 4201,

  ws_port: 5666,
  websocket_public_url: 'ws://localhost:5666/graphql',

  log: {
    level: 'info'
  },

  defaults: {
    adducts: {'+': ['+H', '+Na', '+K'], '-': ['-H', '+Cl']},
    moldb_name: 'HMDB-v4'
  },

  img_upload: {
    iso_img_fs_path: "/opt/data/sm_data/public/",
    backend: "fs", // "fs or "db"
    categories: {
      iso_image: {
        type: 'image/png',
        path: '/iso_images/'
      },
      optical_image: {
        type: 'image/jpeg',
        path: '/optical_images/'
      },
      raw_optical_image: {
        type: 'image/jpeg',
        path: '/raw_optical_images/'
      }
    }
  },

  services: {
    moldb_service_host: "localhost:5000",
    sm_engine_api_host: "localhost:5123"
  },

  db: {
    host: "localhost",
    database: "sm",
    user: "sm",
    password: "password"
  },

  elasticsearch: {
    host: "localhost",
    port: 9200,
    index: "sm"
  },

  slack: {},

  jwt: {
    secret: "jwtsecret"
  },

  rabbitmq: {
    host: 'localhost',
    port: 5672,
    user: 'sm',
    password: 'password'
  }
};

module.exports = config;
