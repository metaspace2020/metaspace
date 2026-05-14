"""Public entry points for the stats_analysis microservice."""
from typing import Dict

from .runner import (
    run_experiment_prep as _run_prep,
    run_experiment_stats as _run_stats,
)

__all__ = ['run_experiment_prep', 'run_experiment_stats']


def run_experiment_prep(experiment_id: str, run_generation: int, payload: Dict) -> Dict:
    return _run_prep(experiment_id, run_generation, payload)


def run_experiment_stats(
    experiment_id: str,
    run_generation: int,
    payload: Dict,
) -> Dict:
    return _run_stats(experiment_id, run_generation, payload)
