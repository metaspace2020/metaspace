"""Create S3 buckets in the configured storage service. Idempotent.

The dev stack and CI use RustFS as the S3-compatible object store. Unlike the old
MinIO command line, RustFS is not told to pre-create buckets, so this script is run
once after the storage container is up (docker/sm-engine/create-buckets.sh in the
dev stack, a "Create storage buckets" step in .circleci/config.yml).

Endpoint and credentials come from the "storage" section of the SM config.

Usage (from metaspace/engine):
    python -m scripts.create_buckets sm-engine-dev sm-image-storage-dev
    python -m scripts.create_buckets --config conf/test_config.json sm-lithops-test
"""
import argparse

from sm.engine.config import SMConfig
from sm.engine.storage import ensure_buckets, get_s3_client, wait_for_storage


def main():
    parser = argparse.ArgumentParser(description='Create S3 buckets in the configured storage')
    parser.add_argument('buckets', nargs='+', help='Bucket names to create if missing')
    parser.add_argument(
        '--config', dest='config_path', default='conf/config.json', help='SM config path'
    )
    parser.add_argument(
        '--timeout',
        dest='timeout_sec',
        type=int,
        default=60,
        help='Seconds to wait for the storage endpoint before failing',
    )
    args = parser.parse_args()

    SMConfig.set_path(args.config_path)
    sm_config = SMConfig.get_conf()
    s3_client = get_s3_client(sm_config)

    wait_for_storage(s3_client, timeout_sec=args.timeout_sec)
    ensure_buckets(args.buckets, s3_client)
    print(f'Buckets ready: {", ".join(args.buckets)}')


if __name__ == '__main__':
    main()
