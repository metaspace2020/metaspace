"""Umbrella Bottle server for METASPACE postprocessing services.

Mounts each sub-service under its own URL prefix so multiple postprocessing
microservices share a single port and container:

    POST /segmentation/run    -> image_segmentation.app
    POST /experiment/run      -> stats_analysis.app
    GET  /experiment/health   -> stats_analysis.app
    GET  /health              -> umbrella liveness

Sub-app routes are written relative (e.g. ``@app.post('/run')``); Bottle
strips the mount prefix before dispatching.

Config path resolution:
    1. ``$POSTPROCESSING_CONFIG`` if set
    2. ``<repo>/metaspace/postprocessing/conf/config.json`` (dev fallback)
"""
import logging
import os
import threading
from pathlib import Path

import bottle

from image_segmentation.app import app as segmentation_app
from image_segmentation.restart import (
    delayed_restart_pending_jobs as delayed_restart_pending_segmentation_jobs,
)
from postprocessing_shared import load_config
from stats_analysis.app import app as stats_analysis_app
from stats_analysis.restart import (
    delayed_restart_pending_jobs as delayed_restart_pending_experiment_jobs,
)

# PREP payloads can ship multi-MB JSON; raise from Bottle's 100 KB default.
bottle.BaseRequest.MEMFILE_MAX = 256 * 1024 * 1024

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger(__name__)

app = bottle.Bottle()
app.mount('/segmentation', segmentation_app)
app.mount('/experiment', stats_analysis_app)


@app.get('/health')
def health():
    return {'status': 'ok'}


def _resolve_config_path() -> Path:
    env = os.environ.get('POSTPROCESSING_CONFIG')
    if env:
        return Path(env)
    # …/postprocessing/server/postprocessing_server/app.py -> …/postprocessing/conf/config.json
    return Path(__file__).resolve().parents[2] / 'conf' / 'config.json'


def main():
    logger.info("=== Postprocessing Umbrella Server Starting ===")
    config_path = _resolve_config_path()
    logger.info(f"Loading config from {config_path}")
    config = load_config(config_path)

    bottle_config = config['bottle']
    logger.info(
        f"Starting on {bottle_config['host']}:{bottle_config['port']} {bottle_config['server']}"
    )

    threading.Thread(
        target=delayed_restart_pending_segmentation_jobs, args=(config,), daemon=True
    ).start()
    threading.Thread(
        target=delayed_restart_pending_experiment_jobs, args=(config,), daemon=True
    ).start()

    app.run(**bottle_config)


if __name__ == '__main__':
    main()
