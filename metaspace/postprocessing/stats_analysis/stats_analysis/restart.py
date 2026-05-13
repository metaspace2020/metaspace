"""Startup hook: ask the engine to re-enqueue pending experiment_stats jobs.

Mirrors :mod:`image_segmentation.restart` — when this container restarts mid-run,
the engine still has rows in ``PREPARING``/``RUNNING`` whose RabbitMQ messages
were already acked. Without this hook they'd be stranded.
"""
import logging

import requests

from postprocessing_shared import wait_for_api_ready

logger = logging.getLogger(__name__)


def restart_pending_jobs(config):
    """Ask the engine REST API to republish pending experiment_stats jobs."""
    logger.info("=== Starting pending experiment_stats restart process ===")
    engine_url = config.get('engine_url', 'http://localhost:5000')
    try:
        restart_url = f"{engine_url}/v1/experiment/restart_pending"
        logger.info("Requesting engine to restart pending experiment_stats jobs...")
        response = requests.post(restart_url, json={}, timeout=30)
        logger.info(f"Received response: HTTP {response.status_code}")
        if response.status_code != 200:
            logger.error(f"Failed to restart pending jobs: HTTP {response.status_code}")
            logger.error(f"Response body: {response.text}")
            return
    except requests.exceptions.ConnectTimeout as e:
        logger.error(f"Connection timeout to engine at {engine_url}: {e}")
    except requests.exceptions.ConnectionError as e:
        logger.error(f"Connection error to engine at {engine_url}: {e}")
    except requests.exceptions.RequestException as e:
        logger.error(f"Request error when calling engine: {e}")
    except Exception as e:  # pylint: disable=broad-except
        logger.error(f"Failed to restart pending jobs: {e}", exc_info=True)
    finally:
        logger.info("=== Pending experiment_stats restart process completed ===")


def delayed_restart_pending_jobs(config):
    """Wait for the engine API to be ready, then restart pending jobs."""
    engine_url = config.get('engine_url', 'http://localhost:5123')
    if wait_for_api_ready(engine_url):
        logger.info("API is ready, proceeding with experiment_stats restart...")
        restart_pending_jobs(config)
    else:
        logger.error("API service did not become ready, skipping experiment_stats restart")
