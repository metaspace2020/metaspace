import logging
import time

import requests

logger = logging.getLogger(__name__)


def wait_for_api_ready(engine_url: str, max_wait_seconds: int = 300, check_interval: int = 5) -> bool:
    """Wait for an HTTP service to be ready by polling its /health endpoint.

    Returns True once a 200 or 404 is received (404 = service up, no /health route),
    False if the timeout elapses first.
    """
    logger.info(f"Waiting for API at {engine_url} to become ready...")
    start_time = time.time()

    base = engine_url.rstrip('/')
    health_url = f"{base}/health"

    while time.time() - start_time < max_wait_seconds:
        try:
            response = requests.get(health_url, timeout=5)
            if response.status_code in (200, 404):
                logger.info(f"API service is ready at {engine_url}")
                return True
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            pass
        except Exception as e:
            logger.debug(f"Health check attempt failed: {e}")

        elapsed = time.time() - start_time
        logger.info(f"API not ready yet, waiting... ({elapsed:.1f}s elapsed)")
        time.sleep(check_interval)

    logger.warning(f"API service did not become ready within {max_wait_seconds} seconds")
    return False
