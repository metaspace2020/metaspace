#!/usr/bin/env bash
NODE_ENV=production webpack --profile --json | tail -n +2 > stats.json
webpack-bundle-analyzer stats.json dist/ -p 9900 -O
