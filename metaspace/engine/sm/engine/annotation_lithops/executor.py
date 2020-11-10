import inspect
import logging
import resource
from itertools import chain
from time import time
from typing import List, Callable, TypeVar, Iterable, Union, Tuple, Sequence

import lithops
from lithops.future import ResponseFuture

from sm.engine.annotation_lithops.utils import PipelineStats

logger = logging.getLogger('custom-executor')
TRet = TypeVar('TRet')


class Executor:
    def __init__(self, lithops_config):
        self.is_local = lithops_config['lithops']['executor'] == 'localhost'

        if self.is_local:
            self.large_executor = self.small_executor = lithops.local_executor(
                config=lithops_config, storage_backend='localhost'
            )
        else:
            self.small_executor = lithops.function_executor(config=lithops_config)
            self.large_executor = lithops.function_executor(
                config=lithops_config, type='standalone', backend='ibm_vpc'
            )
        self.storage = self.small_executor.storage
        self._include_modules = lithops_config['lithops'] or []

    def map(
        self,
        func: Callable[..., TRet],
        args: Sequence,
        *,
        runtime_memory: int = None,
        include_modules=None,
        **kwargs,
    ) -> List[TRet]:
        def wrapper_func(*args, **kwargs):
            def get_meta():
                return {
                    'inner_time': time() - t,
                    'mem_before': mem_before,
                    'mem_after': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                }

            mem_before = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            t = time()
            try:
                result = func(*args, **kwargs)
                return result, get_meta()
            except Exception as ex:
                ex.executor_meta = get_meta()
                raise

        wrapper_func.__signature__ = inspect.signature(func)  # type: ignore # https://github.com/python/mypy/issues/5958
        wrapper_func.__name__ = func.__name__

        if runtime_memory is None:
            runtime_memory = 512
        if include_modules is not None:
            kwargs['include_modules'] = [*self._include_modules, *include_modules]

        while True:
            try:
                use_small = runtime_memory <= 4096
                executor = self.small_executor if use_small else self.large_executor

                logger.info(f'executor.map({func.__name__}, {len(args)} items, {runtime_memory}MB)')
                futures: List[ResponseFuture] = executor.map(
                    wrapper_func, args, runtime_memory=runtime_memory, **kwargs,
                )

                # TODO: debug logic:
                # * retry with more memory if there is an OOM
                # * try to record stats, even if a task fails

                return_vals = executor.get_result(futures)

                results = [result for result, meta in return_vals]
                metas = [meta for result, meta in return_vals]

                # if not use_small:
                #     total_time = sum(meta['inner_time'] for meta in metas if meta)
                #     PipelineStats.append_vm(func.__name__, total_time)
                # else:
                PipelineStats.append_pywren(futures, runtime_memory)

                return results

            except MemoryError:
                old_memory = runtime_memory
                runtime_memory *= 2
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
