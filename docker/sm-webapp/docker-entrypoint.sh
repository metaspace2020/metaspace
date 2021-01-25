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

export NODE_ENV=development
cd /opt/dev/metaspace/metaspace/webapp

yarn install
npm rebuild node-sass # Ensure the musl version is installed
yarn run deref-schema

wait_for "nc -z redis 6379" "Redis"

exec yarn run dev
