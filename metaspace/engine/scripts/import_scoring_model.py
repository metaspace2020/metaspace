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
    is_default: bool,
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
    save_scoring_model_to_db(
        name=name, type_=model_type, version=version, is_default=is_default, params=params
    )
    logger.info('Done')


def main():
    # First parse to check model_type
    pre_parser = argparse.ArgumentParser(add_help=False)
    pre_parser.add_argument(
        '--model_type', default='catboost', help='Model type: catboost or original'
    )
    pre_args, remaining_argv = pre_parser.parse_known_args()

    # Main parser
    parser = argparse.ArgumentParser(description='Upload and import a .cbm CatBoost scoring model')
    parser.add_argument('name', type=str, help='Name')
    parser.add_argument('version', type=str, help='Version')

    # Make model and bucket optional if model_type is original
    if pre_args.model_type == 'original':
        parser.add_argument(
            'model',
            type=str,
            nargs='?',
            default=None,
            help='Path to a CBM model file. Optional for original models.',
        )
        parser.add_argument(
            'bucket',
            type=str,
            nargs='?',
            default=None,
            help='S3 or MinIO bucket to upload to. Optional for original models.',
        )
    else:
        parser.add_argument('model', type=str, help='Path to a CBM model file.')
        parser.add_argument('bucket', type=str, help='S3 or MinIO bucket to upload to')

    parser.add_argument(
        '--overwrite', action='store_true', help='Overwrite scoring model if it already exists'
    )
    parser.add_argument(
        '--public', action='store_true', help='Set object ACLs to allow public access'
    )
    parser.add_argument(
        '--config', dest='config_path', default='conf/config.json', help='SM config path'
    )
    parser.add_argument('--is_default', action='store_true', help='Is default model')

    args = parser.parse_args(remaining_argv)  # Use the remaining arguments for the main parse

    with GlobalInit(args.config_path):
        print(f"Model Type1: {pre_args.model_type}")
        print(f"Name: {args.name}, Version: {args.version}")
        if pre_args.model_type == 'catboost':
            assert Path(args.model).exists(), f'File "{args.model}" not found'

        import_model(
            name=args.name,
            model=args.model,
            bucket=args.bucket,
            public=args.public,
            overwrite=args.overwrite,
            version=args.version,
            model_type=pre_args.model_type,
            is_default=args.is_default,
        )


if __name__ == "__main__":
    main()
