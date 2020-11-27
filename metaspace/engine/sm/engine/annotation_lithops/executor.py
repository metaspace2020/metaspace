from __future__ import annotations

import inspect
import logging
import resource
from datetime import datetime
from itertools import chain
from typing import List, Callable, TypeVar, Iterable, Sequence, Dict, Optional, Tuple

import lithops
import numpy as np
import pandas as pd
from lithops.future import ResponseFuture
from lithops.storage import Storage

from sm.engine.utils.perf_profile import SubtaskProfiler, Profiler, NullProfiler

logger = logging.getLogger('custom-executor')
TRet = TypeVar('TRet')
#: RUNTIME_DOCKER_IMAGE is defined in code instead of config so that devs don't have to coordinate
#: manually updating their config files every time it changes. The image must be public on
#: Docker Hub, and can be rebuilt using the scripts/Dockerfile in `engine/docker/lithops_ibm_cf`.
RUNTIME_DOCKER_IMAGE = 'metaspace2020/metaspace-lithops:1.8.1'
MEM_LIMITS = {
    'ibm_cf': 4096,
    'ibm_vpc': 32768,
}


def _build_wrapper_func(func: Callable[..., TRet]) -> Callable[..., TRet]:
    def wrapper_func(*args, **kwargs):
        def finalize_perf():
            if len(subtask_perf.entries) > 0 and 'finished' not in subtask_perf.entries:
                subtask_perf.record_entry('finished')
            subtask_perf.add_extra_data(
                **{
                    'inner time': (datetime.now() - start_time).total_seconds(),
                    'mem before': mem_before,
                    'mem after': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                }
            )
            return subtask_perf

        start_time = datetime.now()
        subtask_perf = SubtaskProfiler()
        if has_perf_arg:
            kwargs['perf'] = subtask_perf

        mem_before = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        try:
            result = func(*args, **kwargs)
            return result, finalize_perf()
        except Exception as e:
            e.executor_meta = finalize_perf()
            raise

    sig = inspect.signature(func)
    has_perf_arg = 'perf' in sig.parameters
    newsig = sig.replace(parameters=[p for p in sig.parameters.values() if p.name != 'perf'])
    wrapper_func.__signature__ = newsig  # type: ignore # https://github.com/python/mypy/issues/5958
    wrapper_func.__name__ = func.__name__

    return wrapper_func


def _save_subtask_perf(
    perf: Profiler,
    func_name: str,
    futures: Optional[List[ResponseFuture]],
    subtask_perfs: List[SubtaskProfiler],
    cost_factors: Optional[pd.DataFrame],
    attempt: int,
    runtime_memory: int,
    start_time: datetime,
):
    subtask_timings, subtask_data = SubtaskProfiler.make_report(subtask_perfs)
    cost_factors_plain = cost_factors.to_dict('list') if cost_factors is not None else None
    if futures:
        exec_times = [f.stats.get('worker_func_exec_time', -1) for f in futures]
    else:
        exec_times = [-1]
    inner_times = subtask_data.pop('inner time', [-1])
    mem_befores = subtask_data.pop('mem before', [-1])
    mem_afters = subtask_data.pop('mem after', [-1])
    perf_data = {
        'num_actions': len(futures) if futures else -1,
        'attempts': attempt,
        'runtime_memory': runtime_memory,
        'max_memory': np.max(mem_afters).item(),
        'max_time': np.max(exec_times).item(),
        'overhead_memory': np.max(mem_befores).item(),
        'overhead_time': (np.mean(exec_times) - np.mean(inner_times)).item(),
        'cost_factors': cost_factors_plain,
        'exec_times': exec_times,
        'mem_usages': mem_afters,
        'subtask_timings': subtask_timings,
        'subtask_data': subtask_data,
    }
    perf.record_entry(func_name, start_time, datetime.now(), **perf_data)

    # Print a summary
    if any(subtask_timings) or any(subtask_data):
        subtask_df = pd.concat([pd.DataFrame(subtask_timings), pd.DataFrame(subtask_data)], axis=1)
        if futures and len(futures) > 1:
            subtask_summary = subtask_df.describe().transpose().to_string()
        else:
            subtask_summary = subtask_df.iloc[0].to_string()
        logger.debug(f'Subtasks:\n{subtask_summary}')


class Executor:
    """
    This class wraps Lithops' FunctionExecutor to provide a platform where we can experiment with
    new framework-level features without first needing them to be implemented in Lithops.
    If a feature is successful, it should be upstreamed to Lithops as an RFC or PR.

    Current features:
      * Switch to the Standalone executor if >4GB of memory is required
      * Retry with 2x more memory if an execution fails due to an OOM
      * Collect & record per-invocation performance statistics & custom data
        * A named kwarg `perf` of type `SubtaskPerf` will be injected if in the parameter list,
          allowing a function to supply more granular timing data and add custom data.
        * Memory & time usage is recorded for each invocation.
        * A `cost_factors` DataFrame may be supplied - currently just saved to DB, but planned
          to be used as a data source for predicting memory & time usage automatically based on
          previous executions.
          This DF should have one row per job (in the same order), and each column should be a float
          that represents some factor that could contribute to memory/time usage.
      * Utility functions e.g. `map_unpack` and `map_concat` for applying common transformations
        to the result data.
    """

    def __init__(self, lithops_config: Dict, perf: Profiler = None, debug_run_locally=False):
        mode = lithops_config['lithops']['mode']
        self.debug_run_locally = debug_run_locally
        if debug_run_locally:
            self.executors = {}
        elif mode == 'localhost':
            self.executors = {
                'localhost': lithops.function_executor(
                    config=lithops_config, storage='localhost', runtime=RUNTIME_DOCKER_IMAGE,
                )
            }
        else:
            self.executors = {
                'ibm_cf': lithops.function_executor(
                    config=lithops_config, runtime=RUNTIME_DOCKER_IMAGE
                ),
                'ibm_vpc': lithops.function_executor(
                    config=lithops_config,
                    mode='standalone',
                    backend='ibm_vpc',
                    runtime=RUNTIME_DOCKER_IMAGE,
                ),
            }

        self.storage = Storage(
            lithops_config=lithops_config,
            storage_backend=lithops_config['lithops']['storage_backend'],
        )
        self._include_modules = lithops_config['lithops'].get('include_modules', [])
        self._perf = perf or NullProfiler()

    def _execute_map(
        self, func, args, runtime_memory, debug_run_locally, **kwargs
    ) -> Tuple[Optional[ResponseFuture], List]:
        if self.debug_run_locally or debug_run_locally:
            func_kwargs = {}
            if 'storage' in inspect.signature(func).parameters:
                func_kwargs['storage'] = self.storage
            futures = None
            return_vals = [func(*funcargs, **func_kwargs) for funcargs in args]
        else:
            valid_executors = [
                (executor_type, executor)
                for executor_type, executor in self.executors.items()
                if runtime_memory <= MEM_LIMITS.get(executor_type, runtime_memory)
            ]

            assert valid_executors, f'Could not find an executor supporting {runtime_memory}MB'
            executor_type, executor = valid_executors[0]
            logger.debug(f'Selected executor {executor_type}')
            futures = executor.map(func, args, runtime_memory=runtime_memory, **kwargs)
            return_vals = executor.get_result(futures)
        return futures, return_vals

    def map(
        self,
        func: Callable[..., TRet],
        args: Sequence,
        *,
        cost_factors: pd.DataFrame = None,
        runtime_memory: int = None,
        include_modules=None,
        debug_run_locally=False,
        **kwargs,
    ) -> List[TRet]:
        if len(args) == 0:
            return []
        if cost_factors is not None:
            assert len(cost_factors) == len(args)
        if runtime_memory is None:
            runtime_memory = 512
        # Make sure runtime_memory is a power of 2 to avoid making too many runtime variants
        runtime_memory = int(2 ** np.ceil(np.log2(runtime_memory)))

        if include_modules is not None:
            kwargs['include_modules'] = [*self._include_modules, *include_modules]

        wrapper_func = _build_wrapper_func(func)
        attempt = 1
        futures = None

        while True:
            start_time = datetime.now()
            try:
                logger.info(f'executor.map({func.__name__}, {len(args)} items, {runtime_memory}MB)')
                futures, return_vals = self._execute_map(
                    wrapper_func,
                    args,
                    runtime_memory=runtime_memory,
                    debug_run_locally=debug_run_locally,
                    **kwargs,
                )

                results = [result for result, subtask_perf in return_vals]
                subtask_perfs = [subtask_perf for result, subtask_perf in return_vals]

                if self._perf:
                    _save_subtask_perf(
                        self._perf,
                        func_name=func.__name__,
                        futures=futures,
                        subtask_perfs=subtask_perfs,
                        cost_factors=cost_factors,
                        attempt=attempt,
                        runtime_memory=runtime_memory,
                        start_time=start_time,
                    )

                logger.info(
                    f'executor.map({func.__name__}, {len(args)} items, {runtime_memory}MB)'
                    f' - {(datetime.now() - start_time).total_seconds():.3f}s'
                )

                return results

            except MemoryError:
                failed_activation_ids = [f['id'] for f in (futures or []) if f.error]
                failed_activation_id = next(iter(failed_activation_ids), None)
                self._perf.record_entry(
                    f'{func.__name__}_OOM_{attempt}',
                    start_time,
                    datetime.now(),
                    extra_data={
                        'runtime_memory': runtime_memory,
                        'failed_activation_id': failed_activation_id,
                    },
                )
                old_memory = runtime_memory
                runtime_memory *= 2
                attempt += 1

                if runtime_memory > 8192:
                    logger.error(
                        f'{func.__name__} used too much memory in activation {failed_activation_id}'
                    )
                    raise
                logger.warning(
                    f'{func.__name__} ran out of memory with {old_memory}MB in activation '
                    f'{failed_activation_id}, retrying with {runtime_memory}MB'
                )

    def map_unpack(self, func, args: Sequence, *, runtime_memory=None, **kwargs):
        results = self.map(func, args, runtime_memory=runtime_memory, **kwargs)
        return zip(*results)

    def map_concat(
        self,
        func: Callable[..., Iterable[TRet]],
        args: Sequence,
        *,
        runtime_memory: int = None,
        **kwargs,
    ) -> List[TRet]:
        results = self.map(func, args, runtime_memory=runtime_memory, **kwargs)
        return list(chain(*results))

    def call(self, func, args, *, runtime_memory=None, **kwargs):
        return self.map(func, [args], runtime_memory=runtime_memory, **kwargs)[0]

    def clean(self):
        for executor in self.executors.values():
            executor.clean()

    def shutdown(self):
        for executor in self.executors.values():
            executor.invoker.stop()
            try:
                executor.dismantle()
            except AttributeError:
                pass  # `dismantle` only exists on standalone compute handler class

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()
