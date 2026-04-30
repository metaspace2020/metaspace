import json
import logging
import math
import threading
import time
from pathlib import Path

import bottle
import requests

from image_segmentation.segm_pipeline import run_segmentation

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger(__name__)

app = bottle.Bottle()


def _load_config():
    config_path = Path(__file__).resolve().parent / 'conf' / 'config.json'
    with open(config_path) as f:
        return json.load(f)


def _restart_pending_jobs(config):
    """Restart pending jobs from engine on startup."""
    logger.info("=== Starting pending jobs restart process ===")
    try:
        engine_url = config.get('engine_url', 'http://localhost:5000')
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


def _wait_for_api_ready(engine_url, max_wait_seconds=300, check_interval=5):
    """Wait for the API service to be ready by checking its health."""
    logger.info(f"Waiting for API at {engine_url} to become ready...")
    start_time = time.time()

    while time.time() - start_time < max_wait_seconds:
        try:
            # Try a simple GET request to check if the service is responding
            health_url = (
                f"{engine_url}/health" if engine_url.endswith('/') else f"{engine_url}/health"
            )
            response = requests.get(health_url, timeout=5)

            if response.status_code in [
                200,
                404,
            ]:  # 404 is ok if /health doesn't exist but service is up
                logger.info(f"API service is ready at {engine_url}")
                return True

        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            # Service not ready yet, continue waiting
            pass
        except Exception as e:
            logger.debug(f"Health check attempt failed: {e}")

        elapsed = time.time() - start_time
        logger.info(f"API not ready yet, waiting... ({elapsed:.1f}s elapsed)")
        time.sleep(check_interval)

    logger.warning(f"API service did not become ready within {max_wait_seconds} seconds")
    return False


def _delayed_restart_pending_jobs(config):
    """Wait for API to be ready, then restart pending jobs."""
    engine_url = config.get('engine_url', 'http://localhost:5123')

    if _wait_for_api_ready(engine_url):
        logger.info("API is ready, proceeding with pending jobs restart...")
        _restart_pending_jobs(config)
    else:
        logger.error("API service did not become ready, skipping pending jobs restart")


def _sanitize(obj):
    """Recursively replace NaN/Inf floats with None for JSON compliance."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


def _serialize_result(result):
    label_map = result.label_map
    if hasattr(label_map, 'tolist'):
        label_map = label_map.tolist()

    segment_profiles = None
    if result.segment_profiles is not None:
        segment_profiles = result.segment_profiles.to_dict(orient='records')

    return {
        'dataset_id': result.dataset_id,
        'algorithm': result.algorithm,
        'parameters_used': result.parameters_used,
        'map_type': result.map_type,
        'label_map': label_map,
        'n_segments': result.n_segments,
        'segment_profiles': segment_profiles,
        'segment_summary': result.segment_summary,
        'diagnostics': result.diagnostics,
    }


def _run_and_callback(body):
    dataset_id = body['dataset_id']
    job_id = body['job_id']
    callback_url = body['callback_url']

    microservice_start_time = time.time()
    logger.info(f'[SEGMENTATION_PERF] Processing started for job {job_id}, dataset {dataset_id}')

    try:
        segmentation_start_time = time.time()
        result = run_segmentation(
            dataset_id=dataset_id,
            algorithm=body.get('algorithm', 'pca_gmm'),
            input_s3_key=body.get('input_s3_key'),
            database_ids=body.get('database_ids'),
            parameters=body.get('parameters', {}),
            fdr=body.get('fdr', 0.1),
            adducts=body.get('adducts'),
            min_mz=body.get('min_mz'),
            max_mz=body.get('max_mz'),
            use_tic=body.get('use_tic', False),
            off_sample=body.get('off_sample'),  # None = no filter
            smoothing=body.get('smoothing', True),
            window_size=body.get('window_size', 3),
        )
        segmentation_time = time.time() - segmentation_start_time
        logger.info(f'[SEGMENTATION_PERF] Core segmentation completed in {segmentation_time:.3f}')

        serialization_start_time = time.time()
        payload = {
            'job_id': job_id,
            'ds_id': dataset_id,
            'status': 'ok',
            'result': _sanitize(_serialize_result(result)),
        }
        serialization_time = time.time() - serialization_start_time
        logger.info(
            f'[SEGMENTATION_PERF] Serialization in {serialization_time:.3f}s for job {job_id}'
        )
    except Exception as e:
        failed_time = time.time() - microservice_start_time
        logger.error(
            f'[SEGMENTATION_PERF] Seg failed for {dataset_id} after {failed_time:.3f}s: {e}'
        )
        payload = {
            'job_id': job_id,
            'ds_id': dataset_id,
            'status': 'error',
            'error': str(e),
        }

    try:
        callback_start_time = time.time()
        requests.post(callback_url, json=payload, timeout=30)
        callback_time = time.time() - callback_start_time

        total_microservice_time = time.time() - microservice_start_time
        logger.info(f'[SEGMENTATION_PERF] Callback posted in {callback_time:.3f}s for job {job_id}')
        logger.info(f'[SEGMENTATION_PERF] Total time: {total_microservice_time:.3f}s')
    except Exception as e:
        logger.error(f'Failed to post callback for job {job_id}: {e}')


@app.post('/run')
def run():
    try:
        body = json.loads(bottle.request.body.getvalue().decode('utf-8'))
    except Exception:
        bottle.response.status = 400
        return {'status': 'error', 'error': 'invalid JSON body'}

    if not body.get('dataset_id'):
        bottle.response.status = 400
        return {'status': 'error', 'error': 'dataset_id is required'}
    if not body.get('job_id'):
        bottle.response.status = 400
        return {'status': 'error', 'error': 'job_id is required'}
    if not body.get('callback_url'):
        bottle.response.status = 400
        return {'status': 'error', 'error': 'callback_url is required'}

    logger.info(f"Accepted segmentation job {body['job_id']} for dataset {body['dataset_id']}")
    threading.Thread(target=_run_and_callback, args=(body,), daemon=True).start()

    bottle.response.status = 202
    return {'status': 'accepted', 'job_id': body['job_id']}


if __name__ == '__main__':
    logger.info("=== Image Segmentation Service Starting ===")
    config = _load_config()
    logger.info(f"Configuration loaded successfully: {config.keys()}")

    bottle_config = config['bottle']
    logger.info(
        f"Starting on {bottle_config['host']}:{bottle_config['port']} {bottle_config['server']}"
    )

    # Start pending jobs restart in background thread after API is ready
    threading.Thread(target=_delayed_restart_pending_jobs, args=(config,), daemon=True).start()

    logger.info("About to start bottle server...")
    app.run(**bottle_config)
