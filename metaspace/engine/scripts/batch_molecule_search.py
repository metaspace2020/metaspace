"""
Script for running batch molecule search
"""
import os
import argparse
import yaml

from sm.engine.util import cmd_check, logger


def resolve_full_path(path):
    if path.startswith('s3') or path.startswith('/'):
        return path
    else:
        base_path = os.path.dirname(args.plan)
        return os.path.join(base_path, path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Run a batch of molecule search jobs')
    parser.add_argument('--plan', type=str, help='Path to plan file in yaml format')
    parser.add_argument('--config', type=str, help='SM config path')

    args = parser.parse_args()

    with open(args.plan) as f:
        plan = yaml.load(f)

        for job in plan['batch']:
            try:
                inp_path = resolve_full_path(job['input_path'])
                ds_conf_path = resolve_full_path(job['ds_config'])

                cmd_check('python scripts/run_molecule_search.py {} {} {} --config {}',
                          job['ds_name'],
                          inp_path,
                          ds_conf_path,
                          args.config)
            except Exception as e:
                logger.error(e)
