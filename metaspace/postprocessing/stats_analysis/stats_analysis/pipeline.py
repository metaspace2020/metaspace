"""Public entry points for the stats_analysis microservice."""
from typing import Dict

from .runner import (
    run_experiment as _run,
    run_experiment_stats_only as _run_stats_only,
)

__all__ = ['run_experiment', 'run_experiment_stats_only']


def run_experiment(experiment_id: str, run_generation: int, payload: Dict) -> Dict:
    return _run(experiment_id, run_generation, payload)


def run_experiment_stats_only(
    experiment_id: str, run_generation: int, payload: Dict,
) -> Dict:
    return _run_stats_only(experiment_id, run_generation, payload)
