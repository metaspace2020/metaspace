"""Pricing and cost-estimate helpers for the annotation cost cap.

This module is shipped into AWS Lambdas: module-level imports must stay limited to the
standard library and ``sm.engine.errors``.
"""
import json
import logging
import os
import time
import uuid
from threading import Thread
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from sm.engine.errors import CostLimitError

logger = logging.getLogger('engine.cost-cap')

DEFAULT_MAX_COST_USD = 10.0
WATCHDOG_INTERVAL = 5  # seconds between cost checks while an executor attempt runs
LAMBDA_TIMEOUT = 900  # seconds, clamp for one invocation
LEDGER_PREFIX = 'cost_cap'
LEDGER_WINDOW = 12 * 3600  # seconds
LEDGER_INTERVAL = 15  # seconds between ledger save/read
CANCEL_POLL_INTERVAL = 15  # seconds between cancel marker polls
CANCEL_ALLOWANCE = 20  # seconds charged per still-running Lambda of a failed attempt

EC2_PRICE: Dict[int, float] = {
    32768: 0.2538,
    65536: 0.5076,
    131072: 1.0152,
    262144: 2.0304,
}


def lambda_cost(gb_secs: float, actions: int) -> float:
    """AWS Lambda price in USD for the given GB-seconds and number of invocations."""
    return 16.67e-6 * gb_secs + 0.20e-6 * actions


def ec2_cost(runtime_memory: int, seconds: float) -> float:
    """EC2 price in USD; 16 and 32 GB runtimes both use the 32 GB VM."""
    memory = runtime_memory if runtime_memory >= 32768 else 32768
    return EC2_PRICE[memory] * seconds / 3600.0


def get_max_cost(lithops_config: dict) -> Optional[float]:
    """Read the cost limit: key absent -> default, None -> no limit, else float."""
    if 'max_cost_usd' not in lithops_config:
        return DEFAULT_MAX_COST_USD
    value = lithops_config['max_cost_usd']
    return None if value is None else float(value)


def is_running(future: Any) -> bool:
    """True only for a future that Lithops reports as running."""
    try:
        return bool(getattr(future, 'running', False))
    except Exception:  # pylint: disable=broad-except
        return False


def future_seconds(future: Any, now: float) -> float:
    """Billable seconds of one invocation so far, clamped to [0, LAMBDA_TIMEOUT]."""
    try:
        status = getattr(future, '_call_status', None) or {}
        start = status.get('worker_start_tstamp')
        end = status.get('worker_end_tstamp')
        if start is not None and end is not None:
            seconds = end - start
        elif is_running(future):
            seconds = now - start if start is not None else 0
        else:
            stats = getattr(future, 'stats', None) or {}
            seconds = stats.get('worker_exec_time') or 0
        return float(min(max(seconds, 0), LAMBDA_TIMEOUT))
    except Exception:  # pylint: disable=broad-except
        return 0.0


def estimate_attempt(
    futures: Optional[Iterable[Any]],
    runtime_memory: int,
    started_at: float,
    now: float,
    is_standalone: bool,
) -> float:
    """Estimated USD cost of one executor attempt."""
    if is_standalone:
        return ec2_cost(runtime_memory, max(now - started_at, 0))
    futures = list(futures or [])
    if not futures:
        return 0.0
    total = sum(future_seconds(f, now) for f in futures)
    return lambda_cost(total * runtime_memory / 1024, len(futures))


class CostLedger:
    """Per-dataset record of one run's estimated cost, kept in the Lithops temp bucket.

    Every storage operation fails open: errors are logged and swallowed.
    """

    def __init__(
        self,
        storage: Any,
        ds_id: str,
        run_id: Optional[str] = None,
        started: Optional[float] = None,
    ):
        self.storage = storage
        self.ds_id = ds_id
        self.run_id = run_id or uuid.uuid4().hex
        self.started = time.time() if started is None else started
        self._cancel_keys: List[str] = []
        self._runs_prefix = f'{LEDGER_PREFIX}/{ds_id}/runs/'
        self._record_key = f'{self._runs_prefix}{self.run_id}.json'

    def new_cancel_key(self) -> str:
        """Return a new cancel-marker key unique to this run and attempt, and remember it."""
        key = f'{LEDGER_PREFIX}/{self.ds_id}/cancel/{self.run_id}-{len(self._cancel_keys) + 1}'
        self._cancel_keys.append(key)
        return key

    def save(self, cost: float, done: bool = False) -> None:
        """Write this run's record (start time, cost so far, cancel keys, done flag)."""
        try:
            body = json.dumps(
                {
                    'started': self.started,
                    'cost': cost,
                    'cancel_keys': self._cancel_keys,
                    'done': done,
                }
            )
            self.storage.put_object(self.storage.bucket, self._record_key, body.encode())
        except Exception:  # pylint: disable=broad-except
            logger.error('Failed to save cost ledger record', exc_info=True)

    def read_others(self, now: float) -> Optional[Tuple[float, List[str]]]:
        """Sum cost and collect cancel keys of other runs of this dataset started in the window.

        Records of runs that finished successfully (``done``) are ignored. Returns None when
        listing the ledger failed; an unreadable record is only skipped.
        """
        total = 0.0
        cancel_keys: List[str] = []
        try:
            bucket = self.storage.bucket
            for item in self.storage.list_objects(bucket, self._runs_prefix):
                key = item.get('Key') if isinstance(item, dict) else item
                if not isinstance(key, str) or key == self._record_key:
                    continue
                try:
                    if self._modified_before_window(item, now):
                        continue
                    record = json.loads(self.storage.get_object(bucket, key))
                    if record.get('done'):
                        continue
                    if record['started'] > now - LEDGER_WINDOW:
                        total += float(record['cost'])
                        cancel_keys.extend(record.get('cancel_keys') or [])
                except Exception:  # pylint: disable=broad-except
                    logger.error(f'Skipping unreadable cost ledger record {key}', exc_info=True)
        except Exception:  # pylint: disable=broad-except
            logger.error('Failed to read cost ledger', exc_info=True)
            return None
        return total, cancel_keys

    @staticmethod
    def _modified_before_window(item: Any, now: float) -> bool:
        """True if the listing item says the record was last written before the window.

        Items without a usable ``LastModified`` return False so that they are fetched.
        """
        try:
            modified = item['LastModified'].timestamp()
        except Exception:  # pylint: disable=broad-except
            return False
        return modified < now - LEDGER_WINDOW

    def write_markers(self, keys: Iterable[str]) -> None:
        """Write a cancel marker object for each key."""
        for key in keys:
            try:
                self.storage.put_object(self.storage.bucket, key, b'1')
            except Exception:  # pylint: disable=broad-except
                logger.error(f'Failed to write cancel marker {key}', exc_info=True)


class CostGuard:
    """Budget guard: sums this dataset's spend and raises ``CostLimitError`` past the limit.

    Everything except the limit decision fails open: ledger errors are logged and ignored.
    """

    def __init__(self, limit: float, ledger: CostLedger):
        self.limit = limit
        self.ledger = ledger
        self.spent = 0.0  # cost of this run's finished attempts
        self._others = 0.0
        self._other_keys: List[str] = []
        self._own_keys: List[str] = []
        self._last_sync: Optional[float] = None

    def new_attempt(self) -> str:
        """Return the cancel key for the attempt about to start."""
        key = self.ledger.new_cancel_key()
        self._own_keys.append(key)
        return key

    def _sync(self, live_cost: float, now: float) -> None:
        """Save this run's cost and refresh the other runs' cost; keep old values on error."""
        self._last_sync = now
        try:
            self.ledger.save(self.spent + live_cost)
            result = self.ledger.read_others(now)
            if result is not None:
                self._others, self._other_keys = result
        except Exception:  # pylint: disable=broad-except
            logger.error('Cost ledger sync failed', exc_info=True)

    def check(
        self, live_cost: float = 0.0, now: Optional[float] = None, force_sync: bool = False
    ) -> None:
        """Raise CostLimitError if others + spent + live_cost exceeds the limit."""
        now = time.time() if now is None else now
        synced = False
        if force_sync or self._last_sync is None or now - self._last_sync >= LEDGER_INTERVAL:
            self._sync(live_cost, now)
            synced = True
        total = self._others + self.spent + live_cost
        if total <= self.limit:
            return
        if not synced:
            self._sync(live_cost, now)  # best effort: get fresh keys of other runs
            total = self._others + self.spent + live_cost
            if total <= self.limit:
                return
        try:
            self.ledger.write_markers(self._own_keys + self._other_keys)
            self.ledger.save(self.spent + live_cost)
        except Exception:  # pylint: disable=broad-except
            logger.error('Failed to write cancel markers', exc_info=True)
        raise CostLimitError(total, self.limit)

    def finish_run(self) -> None:
        """Mark this run's record done so that it no longer counts toward the dataset's total."""
        try:
            self.ledger.save(self.spent, done=True)
        except Exception:  # pylint: disable=broad-except
            logger.error('Failed to mark cost ledger record done', exc_info=True)

    def finish_attempt(
        self,
        cost: float,
        failed: bool = False,
        cancel_key: Optional[str] = None,
        n_running: int = 0,
        runtime_memory: int = 0,
    ) -> None:
        """Add a finished attempt's cost; a failed one is cancelled and charged an allowance."""
        try:
            self.spent += cost
            if failed:
                if cancel_key is not None:
                    self.ledger.write_markers([cancel_key])
                gb_secs = n_running * CANCEL_ALLOWANCE * runtime_memory / 1024
                self.spent += lambda_cost(gb_secs, 0)
            self.ledger.save(self.spent)
        except Exception:  # pylint: disable=broad-except
            logger.error('Failed to record finished attempt', exc_info=True)


def build_guard(lithops_config: dict, storage: Any, ds_id: Optional[str]) -> Optional[CostGuard]:
    """Build a CostGuard, or None when there is no dataset, no limit or the limit is malformed."""
    if ds_id is None:
        return None
    try:
        limit = get_max_cost(lithops_config)
        if limit is None:
            return None
        return CostGuard(limit, CostLedger(storage, ds_id))
    except Exception:  # pylint: disable=broad-except
        logger.error('Could not build cost guard, cost cap disabled', exc_info=True)
        return None


def start_cancel_watcher(
    storage: Any,
    bucket: str,
    key: str,
    interval: float = CANCEL_POLL_INTERVAL,
    exit_fn: Callable[[int], None] = os._exit,  # pylint: disable=protected-access
) -> Thread:
    """Start a daemon thread that kills this process once the cancel marker object exists.

    Immediately and then every ``interval`` seconds it calls
    ``storage.head_object(bucket, key)``; success means the marker exists and ``exit_fn(1)`` is
    called. Any error (missing key, storage failure) is treated as "no marker yet" and polling
    continues.
    """

    def watch():
        while True:
            try:
                storage.head_object(bucket, key)
            except Exception:  # pylint: disable=broad-except
                time.sleep(interval)
                continue
            logger.warning(f'Exiting process: cancel marker {key} found in bucket {bucket}')
            exit_fn(1)
            return

    thread = Thread(target=watch, name='cost-cap-cancel-watcher', daemon=True)
    thread.start()
    return thread
