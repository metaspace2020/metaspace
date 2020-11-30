from logging import Handler, NOTSET, LogRecord
from contextvars import ContextVar
from contextlib import contextmanager
from typing import Optional, List, Callable

log_listeners: ContextVar[Optional[List[Callable[[str], None]]]] = ContextVar(
    'log_listeners', default=None
)


class ContextLogHandler(Handler):
    def __init__(self, level=NOTSET):
        Handler.__init__(self, level)

    def emit(self, record: LogRecord):
        listeners = log_listeners.get()
        if listeners:
            try:
                message = self.format(record)
                for listener in listeners:
                    listener(message)
            except Exception:
                self.handleError(record)


@contextmanager
def capture_logs():
    listeners = log_listeners.get()
    if not listeners:
        listeners = []
        log_listeners.set(listeners)

    captured_logs = []
    listeners.append(captured_logs.append)

    try:
        yield captured_logs
    finally:
        listeners.remove(captured_logs.append)
