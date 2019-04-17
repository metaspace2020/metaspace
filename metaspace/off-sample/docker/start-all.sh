#!/usr/bin/env bash

exec gunicorn --reload --log-level INFO --access-logfile - --workers 2 \
    --worker-class sync --timeout 90 --bind 0.0.0.0:9876 'app:get_app()'
