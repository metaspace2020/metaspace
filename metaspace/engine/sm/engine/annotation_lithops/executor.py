from __future__ import annotations

import copy
import inspect
import logging
import resource
from contextlib import ExitStack
from datetime import datetime
from itertools import chain
from threading import Thread, current_thread
from traceback import format_tb
from typing import List, Callable, TypeVar, Iterable, Sequence, Dict, Optional

import lithops
import numpy as np
import pandas as pd
from lithops.future import ResponseFuture
from lithops.storage import Storage
from lithops.executors import StandaloneExecutor

from sm.engine.utils.perf_profile import SubtaskProfiler, Profiler, NullProfiler

logger = logging.getLogger('engine.lithops-wrapper')
TRet = TypeVar('TRet')

MEM_LIMITS = {
    'localhost': 32 * 1024,
    'aws_lambda': 8 * 1024,
    'aws_ec2_32': 32 * 1024,
    'aws_ec2_64': 64 * 1024,
    'aws_ec2_128': 128 * 1024,
    'aws_ec2_256': 256 * 1024,
}


class LithopsStalledException(Exception):
    pass


def _build_wrapper_func(func: Callable[..., TRet]) -> Callable[..., TRet]:
    def wrapper_func(*args, **kwargs):
        def finalize_perf():
            if len(subtask_perf.entries) > 0 and 'finished' not in subtask_perf.entries:
                subtask_perf.record_entry('finished')
            subtask_perf.add_extra_data(
                **{
                    'mem after': int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0),
                }
            )
            return subtask_perf

        subtask_perf = SubtaskProfiler()
        if has_perf_arg:
            kwargs['perf'] = subtask_perf

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
    request_ids = None
    instance_type = None
    subtask_timings, subtask_data = SubtaskProfiler.make_report(subtask_perfs)
    cost_factors_plain = cost_factors.to_dict('list') if cost_factors is not None else None
    if futures:
        exec_times = [f.stats.get('worker_func_exec_time', -1) for f in futures]
        mem_usages = [int(f.stats.get('worker_peak_memory_end', -1) / 1024 ** 2) for f in futures]
        request_ids = [f.activation_id for f in futures]
        if isinstance(futures.executor, StandaloneExecutor):
            instance_type = futures.executor.compute_handler.backend.master.get_instance_data()['InstanceType']
    else:
        # debug_run_locally=True doesn't make futures
        exec_times = [sum(perf.entries.values()) for perf in subtask_perfs]
        mem_usages = [perf.extra_data['mem after'] for perf in subtask_perfs]
    perf_data = {
        'num_actions': len(exec_times),
        'attempt': attempt,
        'runtime_memory': runtime_memory,
        'max_memory': np.max(mem_usages).item(),
        'max_time': np.max(exec_times).item(),
        'cost_factors': cost_factors_plain,
        'exec_times': exec_times,
        'mem_usages': mem_usages,
        'subtask_timings': subtask_timings,
        'subtask_data': subtask_data,
    }
    if request_ids:
        perf_data['request_ids'] = request_ids
    if instance_type:
        perf_data['instance_type'] = instance_type
    perf.record_entry(func_name, start_time, datetime.now(), **perf_data)

    # Print a summary
    if any(subtask_timings) or any(subtask_data):
        subtask_df = pd.concat([pd.DataFrame(subtask_timings), pd.DataFrame(subtask_data)], axis=1)
        subtask_df['perf.mem_usage'] = mem_usages
        subtask_df['perf.exec_time'] = exec_times
        if futures and len(futures) > 1:
            subtask_summary = subtask_df.describe().transpose().to_string()
        else:
            subtask_summary = subtask_df.iloc[0].to_string()
        logger.debug(f'Subtasks:\n{subtask_summary}')


def exception_to_json_obj(exc):
    if exc is None:
        return None

    obj = {}
    try:
        obj['type'] = type(exc).__name__
        obj['message'] = str(exc)
        if hasattr(exc, '__traceback__'):
            obj['traceback'] = format_tb(getattr(exc, '__traceback__'))
    except Exception:
        logger.warning(f'Failed to serialize exception {exc}', exc_info=True)
    return obj


def generate_aws_executors(lithops_config):
    executors = {
        'aws_lambda': lithops.ServerlessExecutor(
            config=lithops_config, **{'runtime': lithops_config['aws_lambda']['runtime']}
        )
    }
    # create a lithops executor for an EC2 instance with a different amount of RAM
    for ec2_instance_name, ec2_instance_id in lithops_config['aws_ec2']['ec2_instances'].items():
        config = copy.deepcopy(lithops_config)
        config['aws_ec2']['instance_id'] = ec2_instance_id
        executors[ec2_instance_name] = lithops.StandaloneExecutor(
            config=config, **{'runtime': lithops_config['aws_ec2']['runtime']}
        )
    return executors


class Executor:
    """
    This class wraps Lithops' FunctionExecutor to provide a platform where we can experiment with
    new framework-level features without first needing them to be implemented in Lithops.
    If a feature is successful, it should be upstreamed to Lithops as an RFC or PR.

    Current features:
      * Switch to the Standalone executor if >10GB of memory is required
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
        self.debug_run_locally = debug_run_locally
        self.is_hybrid = False
        if debug_run_locally:
            self.executors = {}
        elif lithops_config['lithops']['mode'] == 'localhost':
            self.executors = {
                'localhost': lithops.LocalhostExecutor(
                    config=lithops_config,
                    storage=lithops_config['lithops']['storage'],
                    **{
                        'runtime': 'python'
                    },  # Change to RUNTIME_EC2_IMAGE to run in a Docker container
                )
            }
        else:
            self.is_hybrid = True
            self.executors = generate_aws_executors(lithops_config)

        self.storage = Storage(lithops_config)
        self._include_modules = lithops_config['lithops'].get('include_modules', [])
        self._execution_timeout = lithops_config['lithops'].get('execution_timeout', 7200) + 60
        self._perf = perf or NullProfiler()

    def map(
        self,
        func: Callable[..., TRet],
        func_args: Sequence,
        *,
        cost_factors: pd.DataFrame = None,
        runtime_memory: int = None,
        include_modules=None,
        debug_run_locally=False,
        max_memory: int = None,
        **lithops_kwargs,
    ) -> List[TRet]:
        if len(func_args) == 0:
            return []
        if cost_factors is not None:
            assert len(cost_factors) == len(func_args)
        if runtime_memory is None:
            runtime_memory = 512
        # Make sure runtime_memory is a power of 2 to avoid making too many runtime variants
        runtime_memory = int(2 ** np.ceil(np.log2(runtime_memory)))

        if include_modules is not None:
            lithops_kwargs['include_modules'] = [*self._include_modules, *include_modules]

        wrapper_func = _build_wrapper_func(func)
        func_name = func.__name__
        attempt = 1

        while True:
            start_time = datetime.now()

            logger.info(
                f'executor.map({func_name}, {len(func_args)} items, {runtime_memory}MB, '
                f'attempt {attempt})'
            )
            futures, return_vals, exc = self._dispatch_map(
                wrapper_func, func_args, runtime_memory, debug_run_locally, lithops_kwargs
            )

            if exc is None:
                if self._perf:
                    _save_subtask_perf(
                        self._perf,
                        func_name=func_name,
                        futures=futures,
                        subtask_perfs=[subtask_perf for result, subtask_perf in return_vals],
                        cost_factors=cost_factors,
                        attempt=attempt,
                        runtime_memory=runtime_memory,
                        start_time=start_time,
                    )

                logger.info(
                    f'executor.map({func_name}, {len(func_args)} items, {runtime_memory}MB, '
                    f'attempt {attempt}) - {(datetime.now() - start_time).total_seconds():.3f}s'
                )

                return [result for result, subtask_perf in return_vals]

            # failed futures
            failed_idxs = [i for i, f in enumerate(futures or []) if f.error]
            # pylint: disable=unsubscriptable-object # (because futures is Optional)
            failed_activation_ids = [futures[i].activation_id for i in failed_idxs]

            self._perf.record_entry(
                func_name,
                start_time,
                datetime.now(),
                error=exception_to_json_obj(exc),
                attempt=attempt,
                runtime_memory=runtime_memory,
                failed_activation_ids=failed_activation_ids,
                request_ids=[f.activation_id for f in futures],  # pylint: disable=not-an-iterable
            )

            if (
                isinstance(exc, (MemoryError, TimeoutError, OSError))
                and runtime_memory <= max(MEM_LIMITS.values())
                and (max_memory is None or runtime_memory < max_memory)
            ):
                attempt += 1
                old_memory = runtime_memory
                runtime_memory *= 2

                logger.warning(
                    f'{func_name} raised {type(exc)} with {old_memory}MB, retrying with '
                    f'{runtime_memory}MB. Failed activation(s): {failed_activation_ids}'
                )
            elif isinstance(exc, LithopsStalledException):
                logger.critical(
                    f'Lithops stalled running {func_name} with {runtime_memory}MB, exiting '
                    f'process to clean up. Failed activation(s): {failed_activation_ids}'
                )
                raise exc
            else:
                logger.error(
                    f'{func_name} raised an exception. '
                    f'Failed activation(s): {failed_idxs} '
                    f'ID(s): {failed_activation_ids}',
                    exc_info=exc,
                )
                raise exc

    def _dispatch_map(
        self, wrapper_func, func_args, runtime_memory, debug_run_locally, lithops_kwargs
    ):
        futures = None
        return_vals = None
        exception = None
        if self.debug_run_locally or debug_run_locally:
            try:
                func_kwargs = {}
                if 'storage' in inspect.signature(wrapper_func).parameters:
                    func_kwargs['storage'] = self.storage
                return_vals = [wrapper_func(*funcargs, **func_kwargs) for funcargs in func_args]
            except Exception as exc:
                exception = exc
        else:
            # Run in another thread so that stalls can be detected & handled
            def run():
                nonlocal futures, return_vals, exception
                try:
                    with ExitStack() as stack:
                        is_standalone = executor.config['lithops']['mode'] == 'standalone'
                        if is_standalone:
                            # With the VM in "consume" mode, Lithops shares the VM between parallel
                            # invocations, which can cause race conditions and OOMs.
                            # To avoid instability, this prevents parallel invocations with a mutex.
                            # Import locally to avoid psycopg2 dependency in Lithops-serialized
                            # functions
                            # pylint: disable=import-outside-toplevel
                            from sm.engine.utils.db_mutex import DBMutex

                            stack.enter_context(DBMutex().lock('vm', self._execution_timeout))
                        futures = executor.map(
                            wrapper_func, func_args, runtime_memory=runtime_memory, **lithops_kwargs
                        )
                        return_vals = executor.get_result(futures)
                        if is_standalone:
                            # Dismantle & wait for it to stop while the mutex is still active
                            # to avoid a race condition, as there's still some instability if a
                            # second request tries to start the VM while it is still stopping.
                            executor.compute_handler.backend.master.stop()
                except Exception as exc:
                    exception = exc

            executor = self._select_executor(runtime_memory)
            thread = Thread(target=run, name=f'{current_thread().name}-ex', daemon=True)
            thread.start()
            thread.join(self._execution_timeout)
            if thread.is_alive():  # If timed out
                exception = LithopsStalledException()

        return futures, return_vals, exception

    def _select_executor(self, runtime_memory):
        valid_executors = [
            (executor_type, executor)
            for executor_type, executor in self.executors.items()
            if runtime_memory <= MEM_LIMITS.get(executor_type, runtime_memory)
        ]
        assert valid_executors, f'Could not find an executor supporting {runtime_memory}MB'
        executor_type, executor = valid_executors[0]
        logger.debug(f'Selected executor {executor_type}')

        if executor.config['lithops']['mode'] == 'standalone':
            # Set number of parallel workers based on memory requirements
            executor.config['lithops']['worker_processes'] = min(
                20, MEM_LIMITS.get(executor_type) // runtime_memory
            )

        return executor

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

    def call(self, func, args, *, runtime_memory=None, cost_factors=None, **kwargs):
        if isinstance(cost_factors, (pd.Series, dict)):
            cost_factors = pd.DataFrame(pd.Series(cost_factors)).transpose()
        else:
            assert cost_factors is None or isinstance(
                cost_factors, pd.DataFrame
            ), "Invalid cost_factors"

        return self.map(
            func, [args], runtime_memory=runtime_memory, cost_factors=cost_factors, **kwargs
        )[0]

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
