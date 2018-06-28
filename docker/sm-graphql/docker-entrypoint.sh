#!/usr/bin/env bash

wait_for() {
  if ! $1; then
    echo "Waiting for $2"
    sleep 5
    until $1; do
        printf '.'
        sleep 1
    done
  fi
  echo "$2 is up"
}

wait_for "nc -z rabbitmq 5672" "RabbitMQ"

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
