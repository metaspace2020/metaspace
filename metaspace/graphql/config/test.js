let config = {};

config.port = 3011;
config.ws_port = 5667;
config.img_storage_port = 4202;

config.log = {};
config.log.level = 'debug';

config.defaults = {
  adducts: {
    "+": ["+H", "+Na", "+K"],
    "-": ["-H", "+Cl"]
  },
  moldb_name: 'HMDB-v2.5'
};

config.img_upload = {
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
};

config.services = {};
/* Molecular database service, used only for internal purposes (peakChartData query) */
config.services.moldb_service_host = "localhost";
/* Public IP of the server that hosts molecule images */
config.services.mol_image_server_host = "localhost";
config.services.sm_engine_api_host = "localhost";

config.db = {};
config.db.host = "localhost";
config.db.database = "sm";
config.db.user = "sm";
config.db.password = "1321";

config.elasticsearch = {};
config.elasticsearch.index = "sm";
config.elasticsearch.host = "localhost";
config.elasticsearch.port = 9200;

config.rabbitmq = {};
config.rabbitmq.host = "localhost";
config.rabbitmq.user = "sm";
config.rabbitmq.password = "1321";

config.slack = {};
config.slack.webhook_url = "";
config.slack.channel = "";

config.jwt = {};
config.jwt.secret = "";

module.exports = config;
