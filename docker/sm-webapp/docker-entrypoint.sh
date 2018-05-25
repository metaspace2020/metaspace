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

if [ "$SM_DOCKER_ENV" = "development" ]; then
  export NODE_ENV=development
  cd /opt/dev/sm-webapp
  yarn install
else
  export NODE_ENV=production
  cd /opt/sm-webapp
fi

wait_for "nc -z postgres 6379" "Redis"

exec node server.js
