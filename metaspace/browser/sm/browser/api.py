import io
import functools

import PIL.Image
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from starlette.responses import StreamingResponse
import uvicorn
from fastapi.middleware.cors import CORSMiddleware

from sm.browser import utils
from sm.browser.main import preprocess_dataset_peaks, DatasetBrowser

app = FastAPI()
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@functools.lru_cache(maxsize=128)
def load_dataset_browser(s3_path: str):
    return DatasetBrowser(s3_path)


class DatasetPreprocessItem(BaseModel):
    s3_path: str


@app.post("/preprocess")
async def preprocess(item: DatasetPreprocessItem):
    preprocess_dataset_peaks(item.s3_path)
    return {"status": "ok"}


class PixelSearchItem(BaseModel):
    s3_path: str
    x: int
    y: int

class MzSearchItem(BaseModel):
    s3_path: str
    mz: float
    ppm: int = 3


class PngStreamingResponse(StreamingResponse):
    media_type = "image/png"


@app.post("/search", response_class=PngStreamingResponse)
async def perform_search(item: MzSearchItem):
    dataset_browser = load_dataset_browser(item.s3_path)
    mz_lo, mz_hi = utils.mz_ppm_bin(mz=item.mz, ppm=item.ppm)
    rgba_array = dataset_browser.search(mz_lo, mz_hi)

    image = PIL.Image.fromarray((rgba_array * 255).astype(np.uint8), mode="RGBA")
    fp = io.BytesIO()
    image.save(fp, format="PNG")
    fp.seek(0)
    return PngStreamingResponse(fp)


@app.post("/search_pixel")
async def perform_search(item: PixelSearchItem):
    dataset_browser = load_dataset_browser(item.s3_path)
    return JSONResponse(dataset_browser.search_pixel(item.x, item.y))


if __name__ == "__main__":
    uvicorn.run(app)
