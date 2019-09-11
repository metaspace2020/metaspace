import base64
from concurrent.futures import ThreadPoolExecutor
from requests import get, post
from pathlib import Path
import subprocess
import pandas as pd

from off_sample.utils import logger

TEST_DATA_URL = 'https://s3-eu-west-1.amazonaws.com/sm-off-sample/test-data.tar.gz'
DATA_PATH = Path('/tmp/off-sample-test-data')
API_ENDPOINT = 'http://localhost:9876/off-sample'


def predict_chunk(image_path_chunk):
    base64_images = []
    for fp in image_path_chunk:
        with open(fp, 'rb') as f:
            content = base64.b64encode(f.read()).decode()
            base64_images.append(content)
    doc = {'images': [{'content': content} for content in base64_images]}

    resp = post(url=API_ENDPOINT + '/predict', json=doc)
    if resp.status_code == 200:
        chunk_preds = resp.json()['predictions']
    else:
        raise Exception(resp)
    return chunk_preds


def make_chunk_gen(items, chunk_size):
    chunk_n = (len(items) - 1) // chunk_size + 1
    chunks = [items[i * chunk_size : (i + 1) * chunk_size] for i in range(chunk_n)]
    for image_path_chunk in chunks:
        yield image_path_chunk


def test_service():
    DATA_PATH.mkdir(exist_ok=True)

    logger.info(f'Downloading input data from {TEST_DATA_URL} to {DATA_PATH}')
    curl_sp = subprocess.Popen(f'curl -s {TEST_DATA_URL}'.split(' '), stdout=subprocess.PIPE)
    subprocess.Popen(f'tar xz -C {DATA_PATH}'.split(' '), stdin=curl_sp.stdout)

    path_label_df = pd.read_csv(DATA_PATH / 'path_label.csv')
    logger.info('Label counts: {}'.format(path_label_df.label.value_counts().to_dict()))

    image_paths = [DATA_PATH / p for p in path_label_df.path.values]
    image_path_chunks = make_chunk_gen(image_paths, chunk_size=32)

    predictions = []
    with ThreadPoolExecutor(2) as pool:
        for ch_preds in pool.map(predict_chunk, image_path_chunks):
            predictions.extend(ch_preds)

    labels = (path_label_df.label == 'off').astype(int).values
    assert len(predictions) == len(labels)

    preds = [p['prob'] > 0.5 for p in predictions]
    test_accuracy = (preds == labels).mean()
    logger.info(f'Test accuracy: {test_accuracy}')

    assert test_accuracy > 0.95, f'Not enough model test set accuracy: {test_accuracy}'
