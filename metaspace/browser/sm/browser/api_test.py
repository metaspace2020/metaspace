import random

import requests

from sm.browser.api import DatasetPreprocessItem, MzSearchItem
from sm.browser.utils import timing

if __name__ == "__main__":
    API_URL = "http://localhost:8000/"

    @timing
    def preprocess_request(item: DatasetPreprocessItem):
        print(f"Preprocessing: {item}")
        resp = requests.post(API_URL + "preprocess", json=item.dict())
        assert resp.ok, resp.content

    @timing
    def search_request(item: MzSearchItem):
        print(f"Executing search: {item}")
        resp = requests.post(API_URL + "search", json=item.dict())
        assert resp.ok, resp.content

    @timing
    def run_search_batch(s3_path, n=10):
        for _ in range(n):
            mz = round(300 + random.random() * 2000, ndigits=4)
            ppm = random.randrange(1, 11)
            search_request(MzSearchItem(s3_path=s3_path, mz=mz, ppm=ppm))

    # Uncomment the 'preprocess_request' calls below if you have a good upload speed
    s3_path = "s3://sm-engine-dev/dataset-browser/untreated"
    print(f"Small dataset (~35MB): {s3_path}")
    # preprocess_request(DatasetPreprocessItem(s3_path=s3_path))
    run_search_batch(s3_path)

    s3_path = "s3://sm-engine-dev/dataset-browser/4bbdff88-a0c8-468c-8c74-4eee790d7181/"
    print(f"Big dataset (~2GB): {s3_path}")
    # preprocess_request(DatasetPreprocessItem(s3_path=s3_path))
    run_search_batch(s3_path)
