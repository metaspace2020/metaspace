"""
Script for running batch molecule search
"""
import os
import argparse
import yaml

from sm.engine.util import cmd_check


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Run a batch of molecule search jobs')
    parser.add_argument('--plan', type=str, help='Path to plan file in yaml format')
    parser.add_argument('--config', type=str, help='SM config path')

    args = parser.parse_args()

    with open(args.plan) as f:
        plan = yaml.load(f)

        base_path = os.path.dirname(args.plan)

        for job in plan['batch']:
            cmd_check('python scripts/run_molecule_search.py {} {} {} --config {}',
                      job['ds_name'],
                      os.path.join(base_path, job['input_path']),
                      os.path.join(base_path, job['ds_config']),
                      args.config)
