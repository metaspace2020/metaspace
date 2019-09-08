import base64
import json
from os.path import getmtime
import shutil
import socket
from datetime import datetime as dt
from pathlib import Path
from uuid import uuid4
import falcon

from off_sample.model import OffSamplePredictModel
from off_sample.utils import logger
from off_sample.config import config


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

    def predict(self, image_paths):
        path = Path(image_paths[0]).parent
        logger.info(f'Running model on {len(image_paths)} images in {path}')
        probs, labels = self.model.predict(image_paths)
        pred_list = [{'prob': float(prob), 'label': label} for prob, label in zip(probs, labels)]
        return {'predictions': pred_list}

    def on_post(self, req, resp):
        path = None
        try:
            req_doc = json.load(req.bounded_stream)
            path = self.data_path / str(uuid4())
            path.mkdir()
            image_paths = self.save_images(req_doc, path)

            resp_doc = self.predict(image_paths)
            resp.body = json.dumps(resp_doc)
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
