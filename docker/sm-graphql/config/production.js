let config = {};

config.port = 3010;
config.ws_port = 5666;
config.img_storage_port = 4201;

config.log = {};
config.log.level = 'debug';

config.defaults = {
  adducts: {"+": ["+H", "+Na", "+K"], "-": ["-H", "+Cl"]},
  moldb_names: ['HMDB-v4']
};

config.moldbs = {
  deprecated: ['HMDB', 'ChEBI', 'LIPID_MAPS', 'SwissLipids', 'COTTON_HMDB', 'HMDB-v2.5', 'HMDB-v2.5-cotton'],
  custom: ['EMBL-dev1', 'EMBL-dev2', 'M4I_1'],
};


config.services = {};
/* Molecular database service, used only for internal purposes (peakChartData query) */
config.services.moldb_service_host = "nginx:8999/mol_db";
/* Internal ad-hoc service with the only endpoint /reindex/:dataset_id */
config.services.sm_engine_api_host = "sm-api:5123";

config.db = {};
config.db.host = "postgres";
config.db.database = "sm";
config.db.user = "sm";
config.db.schema = "sm";
config.db.password = "password";

config.elasticsearch = {};
config.elasticsearch.index = "sm";
config.elasticsearch.host = "elasticsearch";
config.elasticsearch.port = 9200;

config.rabbitmq = {};
config.rabbitmq.host = "rabbitmq";
config.rabbitmq.user = "sm";
config.rabbitmq.password = "password";

config.redis = {};
config.redis.host = "redis";
config.redis.port = "6379";

config.cookie = {};
config.cookie.secret = "secret";

config.google = {};
config.google.client_id = "";
config.google.client_secret = "";
config.google.callback_url = "";

config.web_public_url = "http://0.0.0.0:8999";

config.slack = {};
config.slack.webhook_url = "";
config.slack.channel = "";

config.jwt = {};
config.jwt.secret = "secret";
config.jwt.algorithm = "HS256";

config.aws = {
  aws_access_key_id: "",
  aws_secret_access_key: "",
  aws_region: "eu-west-1"
};

config.features = {
  graphqlMocks: false,
  impersonation: true,
};

module.exports = config;
