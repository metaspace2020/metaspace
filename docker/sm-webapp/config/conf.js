exports.PORT = "8082";

exports.GOOGLE_CLIENT_ID = "";
exports.GOOGLE_CLIENT_SECRET = ""

/* add this callback URL in Google developer console;
   you must also enable Google+ API for the project */
exports.GOOGLE_CALLBACK_URL = ""

exports.COOKIE_SECRET = "thisisasecretdonttellanyone";
exports.JWT_SECRET = "secret";

exports.ADMIN_EMAILS = "lachlan.stuart@embl.de";

exports.AWS_ACCESS_KEY_ID = "";
exports.AWS_SECRET_ACCESS_KEY = "";

// either 's3' or the destination directory
// must match 'storage' value in src/clientConfig.js
exports.UPLOAD_DESTINATION = "/home/lachlan/dev/embl/ms-docker/sm-data/uploads";

exports.REDIS_CONFIG = {
  host: "redis",
  port: "6379"
}

exports.HOST_NAME = "localhost:8999";

exports.RAVEN_DSN = "https://16556a31185a4882b9ebf6a5abab9452@sentry.io/1203803";
