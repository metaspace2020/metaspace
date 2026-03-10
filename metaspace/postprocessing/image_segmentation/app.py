import logging
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from image_segmentation.segm_pipeline import run_segmentation

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title='Image Segmentation Service')


class SegmentationRequest(BaseModel):
    dataset_id: str
    algorithm: str = 'pca_gmm'
    # S3 path to a pre-built .npz produced by the engine's SegmentationDataLoader.
    # When provided this takes priority and all annotation-fetch fields are ignored.
    input_s3_key: Optional[str] = None
    # Annotation-fetch fields — only used when input_s3_key is None (Python-client fallback)
    databases: Optional[List[List[str]]] = None
    fdr: float = 0.1
    adducts: Optional[List[str]] = None
    min_mz: Optional[float] = None
    max_mz: Optional[float] = None
    use_tic: bool = False
    off_sample: Optional[bool] = False
    parameters: Dict[str, Any] = {}
    smoothing: bool = True
    window_size: int = 3


def _serialize_result(result) -> Dict[str, Any]:
    """Convert SegmentationResult to a JSON-serializable dict."""
    # TODO: upload label_map as an NPY file to S3 and replace with its S3 key here.
    # For large datasets (1M+ pixels) this can be tens of MB of JSON.
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


@app.post('/run')
def run(req: SegmentationRequest):
    logger.info(
        f'Starting segmentation for dataset {req.dataset_id}, algorithm={req.algorithm}'
    )
    try:
        result = run_segmentation(
            dataset_id=req.dataset_id,
            algorithm=req.algorithm,
            input_s3_key=req.input_s3_key,
            databases=req.databases,
            parameters=req.parameters,
            fdr=req.fdr,
            adducts=req.adducts,
            min_mz=req.min_mz,
            max_mz=req.max_mz,
            use_tic=req.use_tic,
            off_sample=req.off_sample,
            smoothing=req.smoothing,
            window_size=req.window_size,
        )
        return {'status': 'ok', 'result': _serialize_result(result)}
    except Exception as e:
        logger.exception(f'Segmentation failed for dataset {req.dataset_id}: {e}')
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Image Segmentation Service')
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=9877)
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port)
