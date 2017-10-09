#!/usr/bin/env bash
#NODE_ENV=production webpack --profile --json > stats.json
webpack-bundle-analyzer stats.json dist/ -p 9900 -O
