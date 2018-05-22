#!/usr/bin/env bash

echo "Waiting for RabbitMQ to start"
until $(nc -z rabbitmq 5672); do
    printf '.'
    sleep 5
done
echo "RabbitMQ is up"

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
