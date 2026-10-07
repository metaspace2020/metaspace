from pathlib import Path
from unittest.mock import patch

from sm.engine.config import init_loggers

MINIMAL_LOGS_CONFIG = {'version': 1, 'disable_existing_loggers': False}


def test_init_loggers_creates_logs_dir(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    init_loggers(MINIMAL_LOGS_CONFIG)

    assert (tmp_path / 'logs').is_dir()


def test_init_loggers_tolerates_logs_dir_created_concurrently(tmp_path, monkeypatch):
    # On a fresh checkout api, update-daemon and lithops-daemon start together and all try to
    # create logs/. Simulate losing the race: the dir appears between exists() and mkdir().
    monkeypatch.chdir(tmp_path)
    (tmp_path / 'logs').mkdir()

    with patch.object(Path, 'exists', return_value=False):
        init_loggers(MINIMAL_LOGS_CONFIG)

    assert (tmp_path / 'logs').is_dir()
