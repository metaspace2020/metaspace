#!/usr/bin/env bash

if [ "$SM_DOCKER_ENV" = "development" ]; then
  export NODE_ENV=development
  cd /opt/dev/sm-graphql
  yarn install
  exec nodemon server.js
else
  export NODE_ENV=production
  cd /opt/sm-graphql
  exec node server.js
fi
