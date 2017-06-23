const config = {
  port: 3010,

  img_upload: {
    iso_img_fs_path: "/opt/data/sm_data/public/",
    img_base_path: "/iso_images/"
  },

  services: {
    moldb_service_host: "localhost:5000",
    mol_image_server_host: "localhost:5100",
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
  },

  websocket_public_url: 'ws://localhost:5666/graphql'
};

module.exports = config;
