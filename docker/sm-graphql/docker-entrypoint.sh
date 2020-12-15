#!/usr/bin/env sh

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
  cd /opt/dev/metaspace/metaspace/graphql
  yarn install
  npm rebuild bcrypt # Ensure the musl version is installed
  yarn run deref-schema
  yarn run gen-binding
  nodemon -e graphql -q --exec "yarn run gen-binding" &
  # exec nodemon -e js,json,ts --require ts-node/register server.js
  exec yarn exec ts-node-dev -- --respawn server.js
else
  export NODE_ENV=production
  cd /opt/metaspace/metaspace/graphql
  exec node --require ts-node/register server.js
fi
