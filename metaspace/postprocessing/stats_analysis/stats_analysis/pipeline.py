"""Public entry point for the stats_analysis microservice.

Delegates to :mod:`stats_analysis.runner`. Kept as its own module so
:mod:`stats_analysis.app` can import a stable name regardless of how the
runner evolves.
"""
from typing import Dict

from .runner import run_experiment as _run

__all__ = ['run_experiment']


def run_experiment(experiment_id: str, run_generation: int, payload: Dict) -> Dict:
    """Run the real stats pipeline; thin wrapper over :mod:`stats_analysis.runner`."""
    return _run(experiment_id, run_generation, payload)
