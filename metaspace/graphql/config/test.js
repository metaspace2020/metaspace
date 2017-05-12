let config = {};

config.port = 3011;

config.img_upload = {};
config.img_upload.iso_img_fs_path = '/opt/data/sm_data/public/';
config.img_upload.img_base_path = '/iso_images/';

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

config.slack = {};
config.slack.webhook_url = "";
config.slack.channel = "";

config.jwt = {};
config.jwt.secret = "";

module.exports = config;