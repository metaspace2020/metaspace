from __future__ import annotations

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from typing import List, Tuple, Optional, Dict

import pandas as pd
from lithops import Storage

from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import CObj, load_cobj
from sm.engine.config import SMConfig
from sm.engine.image_storage import ImageStorage
from sm.engine.utils.perf_profile import SubtaskProfiler

DbFormulaImagesDict = Dict[int, Dict[int, List[Optional[str]]]]


def store_images_to_s3(
    executor: Executor,
    ds_id: str,
    formula_i_to_db_id: pd.Series,
    png_cobjs: List[CObj[List[Tuple[int, bytes]]]],
) -> DbFormulaImagesDict:
    """
    Upload PNG isotopic images to S3 image storage. Images may be uploaded multiple times if a
    formula_i is in multiple databases (i.e. there are duplicates in the formula_i_to_db_id index).
    This is intentional, as there's no check for reused images when deleting individual dataset jobs
    e.g. by removing a moldb without reprocessing. It's easier to just avoid ever reusing images.
    """
    sm_config = SMConfig.get_conf()

    def _upload_png_batch(
        png_cobj: CObj[List[Tuple[int, bytes]]], *, storage: Storage, perf: SubtaskProfiler
    ):
        def _upload_images(pngs):
            return [
                image_storage.post_image(image_storage.ISO, ds_id, png) if png is not None else None
                for png in pngs
            ]

        formula_png_chunk = load_cobj(storage, png_cobj)
        image_storage = ImageStorage(sm_config)
        n_images = 0

        tasks = (
            pd.DataFrame(formula_png_chunk, columns=['formula_i', 'pngs'])
            .set_index('formula_i')
            .join(formula_i_to_db_id, how='inner')
        )
        # Limit parallelism to 4 to avoid accidentally hitting S3's upload limit (3500 PUTs/s)
        with ThreadPoolExecutor(4) as executor:
            db_formula_image_ids: DbFormulaImagesDict = defaultdict(dict)

            for db_id, formula_id, image_ids in zip(
                tasks.moldb_id, tasks.index, executor.map(_upload_images, tasks.pngs)
            ):
                db_formula_image_ids[db_id][formula_id] = image_ids
                n_images += len([i for i in image_ids if i is not None])

        perf.add_extra_data(n_tasks=len(tasks), n_images=n_images)

        return db_formula_image_ids

    results = executor.map(_upload_png_batch, [(cobj,) for cobj in png_cobjs], runtime_memory=512)
    db_formula_image_ids: DbFormulaImagesDict = defaultdict(dict)
    for result in results:
        for db_id, db_result in result.items():
            db_formula_image_ids[db_id].update(db_result)

    return db_formula_image_ids
