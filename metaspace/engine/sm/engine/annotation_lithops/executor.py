from __future__ import annotations

import inspect
import logging
import resource
from datetime import datetime
from itertools import chain
from typing import List, Callable, TypeVar, Iterable, Sequence, Dict

import lithops
from lithops.future import ResponseFuture
import numpy as np
import pandas as pd

from sm.engine.utils.perf_profile import SubtaskProfiler, Profiler, NullProfiler

logger = logging.getLogger('custom-executor')
TRet = TypeVar('TRet')


def _build_wrapper_func(func: Callable[..., TRet]) -> Callable[..., TRet]:
    def wrapper_func(*args, **kwargs):
        def finalize_perf():
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
        except Exception as ex:
            ex.executor_meta = finalize_perf()
            raise

    sig = inspect.signature(func)
    has_perf_arg = 'perf' in sig.parameters
    newsig = sig.replace(parameters=[p for p in sig.parameters.values() if p.name != 'perf'])
    wrapper_func.__signature__ = newsig  # type: ignore # https://github.com/python/mypy/issues/5958
    wrapper_func.__name__ = func.__name__

    return wrapper_func


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

    def __init__(self, lithops_config: Dict, perf: Profiler = None):
        self.is_local = lithops_config['lithops']['mode'] == 'localhost'

        if self.is_local:
            self.large_executor = self.small_executor = lithops.function_executor(
                config=lithops_config, storage='localhost'
            )
        else:
            self.small_executor = lithops.function_executor(config=lithops_config)
            self.large_executor = lithops.function_executor(
                config=lithops_config, mode='standalone', backend='ibm_vpc'
            )
        self.storage = self.small_executor.storage
        self._include_modules = lithops_config['lithops'].get('include_modules', [])
        self._perf = perf or NullProfiler()

    def map(
        self,
        func: Callable[..., TRet],
        args: Sequence,
        *,
        cost_factors: pd.DataFrame = None,
        runtime_memory: int = None,
        include_modules=None,
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

        while True:
            start_time = datetime.now()
            try:
                use_small = runtime_memory <= 4096
                executor = self.small_executor if use_small else self.large_executor

                logger.info(f'executor.map({func.__name__}, {len(args)} items, {runtime_memory}MB)')
                futures: List[ResponseFuture] = executor.map(
                    wrapper_func, args, runtime_memory=runtime_memory, **kwargs,
                )

                return_vals = executor.get_result(futures)
                results = [result for result, subtask_perf in return_vals]
                subtask_perfs = [subtask_perf for result, subtask_perf in return_vals]

                if self._perf:
                    subtask_perf_data = SubtaskProfiler.make_report(subtask_perfs)
                    if len(subtask_perf_data['subtask_timings'].keys()) == 1:
                        # Don't bother storing just the "ended" times, as they're not interesting by themselves
                        subtask_perf_data['subtask_timings'] = {}
                    cost_factors_plain = (
                        cost_factors.to_dict('list') if cost_factors is not None else None
                    )
                    exec_times = [f.stats.get('worker_func_exec_time', -1) for f in futures]
                    inner_times = subtask_perf_data['subtask_data'].pop('inner time')
                    mem_befores = subtask_perf_data['subtask_data'].pop('mem before')
                    mem_afters = subtask_perf_data['subtask_data'].pop('mem after')
                    perf_data = {
                        'num_actions': len(futures),
                        'attempts': attempt,
                        'runtime_memory': runtime_memory,
                        'max_memory': np.max(mem_afters).item(),
                        'max_time': np.max(exec_times).item(),
                        'overhead_memory': np.max(mem_befores).item(),
                        'overhead_time': (np.mean(exec_times) - np.mean(inner_times)).item(),
                        'cost_factors': cost_factors_plain,
                        'exec_times': exec_times,
                        'mem_usages': mem_afters,
                        **subtask_perf_data,
                    }
                    self._perf.record_entry(func.__name__, start_time, datetime.now(), **perf_data)

                return results

            except MemoryError:
                self._perf.record_entry(
                    f'{func.__name__}_OOM_{attempt}',
                    start_time,
                    datetime.now(),
                    extra_data={'runtime_memory': runtime_memory},
                )
                old_memory = runtime_memory
                runtime_memory *= 2
                attempt += 1

                if runtime_memory > 8192:
                    logger.error(f'{func.__name__} used too much memory')
                    raise
                else:
                    logger.warning(
                        f'{func.__name__} ran out of memory with {old_memory}MB, retrying with {runtime_memory}MB'
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
        for executor in {self.small_executor, self.large_executor}:
            executor.clean()

    def shutdown(self):
        for executor in {self.small_executor, self.large_executor}:
            executor.invoker.stop()
            try:
                executor.dismantle()
            except AttributeError:
                pass  # `dismantle` only exists on standalone compute handler class

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()
