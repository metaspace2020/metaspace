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

export NODE_ENV=development
cd /opt/dev/metaspace/metaspace/graphql

yarn install
npm rebuild bcrypt --update-binary # Ensure the musl version is installed

yarn run deref-schema
yarn run gen-binding
nodemon -e graphql -q --exec "yarn run gen-binding" &
exec yarn exec ts-node-dev -- --respawn server.js
# For debugging add --inspect=0.0.0.0:9229  to the above e.g.
# exec yarn exec ts-node-dev -- --respawn server.js
