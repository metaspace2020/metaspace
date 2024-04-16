import argparse
import logging
from pathlib import Path

from sm.engine.util import GlobalInit
from sm.engine.annotation.scoring_model import (
    load_scoring_model,
    upload_catboost_scoring_model,
    save_scoring_model_to_db,
)

logger = logging.getLogger('engine')


def import_model(
    name: str,
    model: str,
    bucket: str,
    public: bool,
    overwrite: bool,
    version: str,
    model_type: str,
):
    params = None
    if model_type == 'catboost':
        if not overwrite:
            try:
                load_scoring_model(name, version)
                assert False, f'Scoring model with name {name} already exists'
            except Exception:
                pass

        prefix = f'scoring_models/{name}'
        logger.info('Uploading model')
        params = upload_catboost_scoring_model(
            model=model, bucket=bucket, prefix=prefix, is_public=public
        )

    logger.info('Inserting model into DB')
    save_scoring_model_to_db(name=name, type_=model_type, version=version, params=params)
    logger.info('Done')


def main():
    parser = argparse.ArgumentParser(description='Upload and import a .cbm CatBoost scoring model')
    parser.add_argument('name', type=str, help='Name')
    parser.add_argument('version', type=str, help='Version')
    parser.add_argument('model_type', type=str, help='Model type: catboost or original')
    parser.add_argument('--model', type=str, default=None, help='Model type: catboost or original')
    parser.add_argument(
        '--bucket',
        type=str,
        default=None,
        help='S3 or MinIO bucket to upload to. Optional for original models.',
    )
    parser.add_argument(
        '--overwrite', action='store_true', help='Overwrite scoring model if it already exists'
    )
    parser.add_argument(
        '--public', action='store_true', help='Set object ACLs to allow public access'
    )
    parser.add_argument(
        '--config', dest='config_path', default='conf/config.json', help='SM config path'
    )

    args = parser.parse_args()

    with GlobalInit(args.config_path):
        if args.model_type == 'catboost':
            assert Path(args.model).exists(), f'File "{args.model}" not found'
            assert args.bucket is not None, f'Bucket "{args.bucket}" not found'

        import_model(
            name=args.name,
            model=args.model,
            bucket=args.bucket,
            public=args.public,
            overwrite=args.overwrite,
            version=args.version,
            model_type=args.model_type,
        )


if __name__ == "__main__":
    main()
