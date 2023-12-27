import base64
import json
from os.path import getmtime
import shutil
import socket
import time
import psutil
from multiprocessing import Manager, Process
from datetime import datetime as dt
from pathlib import Path
from uuid import uuid4
import falcon

from off_sample.model import OffSamplePredictModel
from off_sample.utils import logger
from off_sample.config import config


def predict(model, image_paths, run, pred_list):
    path = Path(image_paths[0]).parent
    logger.info(f'Running model on {len(image_paths)} images in {path}')
    probs, labels = model.predict(image_paths)
    pred_list_ = [{'prob': float(prob), 'label': label} for prob, label in zip(probs, labels)]
    pred_list.extend(pred_list_)
    run.clear()


def cpu_ram_consumption(run, metrics, pid):
    inference_process = psutil.Process(pid)
    while run.is_set():
        start = round(time.time(), 3)
        cpu = psutil.cpu_percent(percpu=True)
        memory = psutil.virtual_memory()
        inference_rss_mb = inference_process.memory_info().rss / 1024.0 ** 2
        metrics.append(
            {start: {'cpu': cpu, 'memory': memory.percent, 'inf_rss_mb': int(inference_rss_mb)}}
        )
        time.sleep(1.0)


class PredictResource:
    def __init__(self):
        self.model = OffSamplePredictModel(config['paths']['model_path'])
        self.data_path = Path(config['paths']['data_path'])
        self.data_path.mkdir(exist_ok=True)
        self.images_limit = 32

    def save_images(self, doc, path):
        images_doc = doc['images'][: self.images_limit]
        logger.info(f"Saving {len(images_doc)} images to {path}")
        image_paths = []
        for i, image_doc in enumerate(images_doc):
            img_bytes = base64.b64decode(image_doc['content'])
            image_path = path / f'image-{i}.png'
            with open(image_path, 'wb') as f:
                f.write(img_bytes)
            image_paths.append(image_path)
        return image_paths

    def on_post(self, req, resp):
        path = None
        try:
            start = time.time()
            req_doc = json.load(req.bounded_stream)
            perf = {
                'ds_id': req_doc['ds_id'],
                'batch_id': req_doc['batch_id'],
                'n_images': len(req_doc['images']),
                'start_ts': round(start, 3),
                'deserialization_time': round(time.time() - start, 3),
            }

            start = time.time()
            path = self.data_path / str(uuid4())
            path.mkdir()
            image_paths = self.save_images(req_doc, path)
            perf['save_images_time'] = round(time.time() - start, 3)

            start = time.time()
            manager = Manager()
            metrics = manager.list()
            resp_list = manager.list()
            run = manager.Event()
            run.set()

            process_1 = Process(target=predict, args=(self.model, image_paths, run, resp_list))
            process_1.start()
            process_2 = Process(target=cpu_ram_consumption, args=(run, metrics, process_1.pid))
            process_2.start()
            process_1.join()
            process_2.join()

            perf['predict'] = round(time.time() - start, 3)
            perf['metrics'] = [m for m in metrics]
            perf['end_ts'] = round(time.time(), 3)
            logger.info(f'Perf: {perf}')
            resp.body = json.dumps({'predictions': [r for r in resp_list]})
        except IOError as e:
            logger.error(e, exc_info=True)
            raise falcon.HTTPError('500')
        finally:
            if path:
                logger.info(f'Cleaning path {path}')
                shutil.rmtree(path)


class PingResource:
    def on_get(self, req, resp):
        updated_dt = dt.fromtimestamp(getmtime(config['paths']['model_path']))
        doc = {'status': 'ok', 'host': socket.getfqdn(), 'updated': dt.isoformat(updated_dt)}
        resp.body = json.dumps(doc, ensure_ascii=False)
