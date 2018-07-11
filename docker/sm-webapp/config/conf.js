exports.PORT = "8082";

exports.GOOGLE_CLIENT_ID = "";
exports.GOOGLE_CLIENT_SECRET = ""

/* add this callback URL in Google developer console;
   you must also enable Google+ API for the project */
exports.GOOGLE_CALLBACK_URL = ""

exports.COOKIE_SECRET = "thisisasecretdonttellanyone";
exports.JWT_SECRET = "secret";

exports.ADMIN_EMAILS = [];
// Set this to true to be automatically logged in as an administrator (Only use this for development!)
exports.AUTO_LOGIN_AS_ADMIN = false;

exports.AWS_ACCESS_KEY_ID = "";
exports.AWS_SECRET_ACCESS_KEY = "";

// either 's3' or the destination directory
// must match 'storage' value in src/clientConfig.js
exports.UPLOAD_DESTINATION = "/opt/data/uploads";

exports.REDIS_CONFIG = {
  host: "redis",
  port: "6379"
}

exports.HOST_NAME = "localhost:8999";

exports.RAVEN_DSN = null;
