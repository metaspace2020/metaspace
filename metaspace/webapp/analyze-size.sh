#!/usr/bin/env bash

rm -rf dist
NODE_ENV=production npx webpack --profile --json | tail -n +3 > stats.json
du -c dist/*.js
npx webpack-bundle-analyzer stats.json dist/ -p 9900 -O
