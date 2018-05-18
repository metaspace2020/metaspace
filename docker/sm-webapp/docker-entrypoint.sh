#!/usr/bin/env bash

if [ "$SM_DOCKER_ENV" = "development" ]; then
  export NODE_ENV=development
  cd /opt/dev/sm-webapp
else
  export NODE_ENV=production
  cd /opt/sm-webapp
fi

exec node server.js
