import base64
import json
import shutil
import socket
from pathlib import Path
from uuid import uuid4
import falcon

from off_sample.model import OffSamplePredictModel
from off_sample.utils import logger
from off_sample.config import config


class PredictResource(object):

    def __init__(self):
        self.model = OffSamplePredictModel(config['paths']['model_path'])
        self.data_path = Path(config['paths']['data_path'])
        self.data_path.mkdir(exist_ok=True)
        self.images_limit = 32

    def save_images(self, doc, path):
        images_doc = doc['images'][:self.images_limit]
        logger.info(f"Saving {len(images_doc)} images to {path}")
        for i, image_doc in enumerate(images_doc):
            img_bytes = base64.b64decode(image_doc['content'])
            image_path = path / f'image-{i}.png'
            with open(image_path, 'wb') as f:
                f.write(img_bytes)

    def predict(self, path):
        logger.info(f'Running model on images in {path}')
        probs, labels = self.model.predict(path)
        pred_list = [{'prob': float(prob), 'label': label}
                     for prob, label in zip(probs, labels)]
        return {'predictions': pred_list}

    def on_post(self, req, resp):
        images_path = None
        try:
            req_doc = json.load(req.bounded_stream)
            images_path = self.data_path / str(uuid4())
            images_path.mkdir()
            self.save_images(req_doc, images_path)

            resp_doc = self.predict(images_path)
            resp.body = json.dumps(resp_doc)
        except IOError as e:
            logger.error(e, exc_info=True)
            raise falcon.HTTPError('500')
        finally:
            if images_path:
                logger.info(f'Cleaning path {images_path}')
                shutil.rmtree(images_path)


class PingResource(object):

    def on_get(self, req, resp):
        doc = {
            'host': socket.getfqdn(),
            'status': 'ok'
        }
        resp.body = json.dumps(doc, ensure_ascii=False)
