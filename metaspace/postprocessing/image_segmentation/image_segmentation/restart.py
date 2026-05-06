"""Startup hook: ask the engine to re-enqueue pending segmentation jobs.

Lives outside ``app.py`` so the umbrella server can call it without importing
the Bottle app module.
"""
import logging

import requests

from postprocessing_shared import wait_for_api_ready

logger = logging.getLogger(__name__)


def restart_pending_jobs(config):
    """Restart pending jobs from engine on startup."""
    logger.info("=== Starting pending jobs restart process ===")
    engine_url = config.get('engine_url', 'http://localhost:5000')
    try:
        restart_url = f"{engine_url}/v1/segmentation/restart_pending"
        logger.info("Requesting engine to restart pending segmentation jobs...")

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
    except Exception as e:
        logger.error(f"Failed to restart pending jobs: {e}", exc_info=True)
    finally:
        logger.info("=== Pending jobs restart process completed ===")


def delayed_restart_pending_jobs(config):
    """Wait for the engine API to be ready, then restart pending jobs."""
    engine_url = config.get('engine_url', 'http://localhost:5123')

    if wait_for_api_ready(engine_url):
        logger.info("API is ready, proceeding with pending jobs restart...")
        restart_pending_jobs(config)
    else:
        logger.error("API service did not become ready, skipping pending jobs restart")
