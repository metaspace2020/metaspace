from __future__ import annotations

import json
import logging
from collections import defaultdict
from contextlib import contextmanager, ExitStack
from datetime import datetime, timedelta
from traceback import format_exc
from typing import List, Optional, Any, Dict

from sm.engine.utils.log_capture import capture_logs

logger = logging.getLogger('perf-profile')


class Profiler:
    def record_entry(
        self,
        name: str,
        start: Optional[datetime] = None,
        finish: Optional[datetime] = None,
        **extra_data: Any,
    ):
        raise NotImplementedError()

    def add_extra_data(self, **extra_data):
        raise NotImplementedError()


class DBProfiler(Profiler):
    def __init__(self, db, profile_id: int, start_time: datetime):
        self._db = db
        self._profile_id = profile_id
        self._next_seq = 0
        self._last_record_time = start_time

    def record_entry(
        self,
        name: str,
        start: Optional[datetime] = None,
        finish: Optional[datetime] = None,
        **extra_data,
    ):
        """
        Records a performance profile entry directly to the database.
        Start/finish time can be optionally specified.

        Args:
            name: Name of the operation/step. Should be past-tense, e.g. "dataset uploaded"
            start: Defaults to last time `record_entry` was called,
                   or when PerfProfileCollector was created
            finish: Defaults to now
            extra_data: Must be JSON-serializable
        """
        now = datetime.now()
        start = start or self._last_record_time
        finish = finish or now
        self._db.insert(
            "INSERT INTO perf_profile_entry (profile_id, sequence, name, start, finish, extra_data)"
            " VALUES (%s, %s, %s, %s, %s, %s)",
            [(self._profile_id, self._next_seq, name, start, finish, json.dumps(extra_data))],
        )
        self._last_record_time = now
        self._next_seq += 1

    def add_extra_data(self, **extra_data):
        """Adds custom data to the top-level perf_profile"""
        (old_extra_data,) = self._db.select_one(
            'SELECT extra_data FROM perf_profile WHERE id = %s', (self._profile_id,)
        )
        extra_data_json = json.dumps({**(old_extra_data or {}), **extra_data})
        self._db.alter(
            'UPDATE perf_profile SET extra_data = %s WHERE id = %s',
            (extra_data_json, self._profile_id),
        )


class NullProfiler(Profiler):
    def record_entry(self, name, start=None, finish=None, **extra_data):
        pass

    def add_extra_data(self, **extra_data):
        pass


@contextmanager
def perf_profile(db, task_type: str, ds_id: Optional[str] = None, include_logs=True):
    """
    ContextManager for recording performance profiles to the database. Although initially
    implemented for dataset annotation, this is intended to be reusable for other operations.
    Additional parameters for identifying jobs should be added if needed, similar to `ds_id`.

    This also collects all logs emitted during the operation unless `include_logs=False` is set.

    Example:
        with perf_profile(db, 'index_dataset', ds_id) as perf:
            dataset = query_dataset()
            perf.record_entry('queried_dataset')
            docs = convert_dataset_to_docs(dataset)
            perf.record_entry('converted_dataset', extra_data={'num_docs': len(docs)})
            index_docs(docs)
    """
    start_time = datetime.now()
    (profile_id,) = db.insert_return(
        "INSERT INTO perf_profile (task_type, ds_id, start) VALUES (%s, %s, %s) RETURNING id",
        [(task_type, ds_id, start_time)],
    )
    with ExitStack() as stack:
        if include_logs:
            logs = stack.enter_context(capture_logs())
        else:
            logs = []

        try:
            yield DBProfiler(db, profile_id, start_time)
        except Exception:
            db.alter(
                "UPDATE perf_profile SET finish = %s, logs = %s, error = %s WHERE id = %s",
                (datetime.now(), '\n'.join(logs), format_exc(), profile_id),
            )
            raise
        else:
            db.alter(
                "UPDATE perf_profile SET finish = %s, logs = %s WHERE id = %s",
                (datetime.now(), '\n'.join(logs), profile_id),
            )


class SubtaskProfiler(Profiler):
    """
    Specialized container for collecting & aggregating performance stats in remote or highly
    parallelized tasks, such as Lithops tasks. This doesn't save anything to the database - it just
    accumulates data to be saved via the `extra_data` in PerfProfileCollector.record_entry().

    To minimize storage requirements and simplify data processing, each "mark" event just
    records the time in milliseconds that has passed since the last time it was called.
    Once merged, timings and extra data are stored in column-oriented dicts of lists.

    Example usage:
        def subtask(...):
            subtask_perf = SubtaskProfiler():
            ...
            subtask_perf.record_entry('loaded data')
            ...
            subtask_perf.record_entry('processed data')
            subtask_perf.add_extra_data(count=len(data))
            ...
            return subtask_perf

        with DbProfiler(...) as perf:
            subtask_perfs = list(map(subtask, jobs))
            timings, extra_data = SubtaskProfiler.make_report(subtask_perfs)
            perf.record_entry('ran subtasks', timings=timings, extra_data=extra_data)

    """

    def __init__(self):
        self._last_entry_time = datetime.now()
        self.entries = {}
        self.extra_data = {}

    def record_entry(self, name, start=None, finish=None, **extra_data):
        assert name not in self.entries
        now = datetime.now()
        start = start or self._last_entry_time
        finish = finish or now
        ms_elapsed = int(round((finish - start).total_seconds() * 1000))
        self.entries[name] = ms_elapsed
        # Increment time by the rounded amount so that the sum of rounded times is always
        # within 1ms of the total unrounded time
        self._last_entry_time += timedelta(milliseconds=ms_elapsed)
        self.extra_data.update(extra_data)

        logger.info(f'Subtask mark {name} {ms_elapsed:.0f}ms {extra_data}')

    def add_extra_data(self, **kwargs):
        self.extra_data.update(kwargs)

    @staticmethod
    def make_report(results: List['SubtaskProfiler']):
        timings: Dict[str, List[Optional[int]]] = defaultdict(lambda: [None] * len(results))
        data: Dict[str, List[Any]] = defaultdict(lambda: [None] * len(results))

        for i, result in enumerate(results):
            for k, elapsed_ms in result.entries.items():
                timings[k][i] = elapsed_ms
            for k, v in result.extra_data.items():
                data[k][i] = v

        return timings, data
