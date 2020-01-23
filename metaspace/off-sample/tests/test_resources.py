import base64
import json
from io import BytesIO, StringIO
from unittest.mock import MagicMock
import numpy as np
from PIL import Image
from falcon import Request, Response

from off_sample.resources import PredictResource


class TestPredictResource:
    def test_on_post_sanity(self):
        req = MagicMock(spec=Request)
        resp = MagicMock(spec=Response)

        base64_images = []
        for cl in ['on', 'off']:
            f_path = f'tests/{cl}-sample.png'
            content = base64.b64encode(open(f_path, 'rb').read()).decode()
            base64_images.append(content)
        doc = {'images': [{'content': content} for content in base64_images]}
        fp = StringIO()
        json.dump(doc, fp)
        fp.seek(0)
        req.bounded_stream = fp

        resource = PredictResource()
        resource.on_post(req, resp)

        resp_json = json.loads(resp.body)
        assert 'predictions' in resp_json
        assert len(resp_json['predictions']) == 2

        on_img_pred = resp_json['predictions'][0]
        assert on_img_pred['prob'] < 0.5 and on_img_pred['label'] == 'on'

        off_img_pred = resp_json['predictions'][1]
        assert off_img_pred['prob'] > 0.5 and off_img_pred['label'] == 'off'
