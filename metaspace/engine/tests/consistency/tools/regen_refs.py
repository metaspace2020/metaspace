import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple

ALLOWED_PREFIX = 'metaspace/engine/tests/consistency/'
ENGINE_DIR = 'metaspace/engine'


def check_clean(status_text: str, allowed_prefix: str) -> List[str]:
    dirty = []
    for line in status_text.splitlines():
        if not line.strip():
            continue
        path = line[3:].strip().split(' -> ')[-1].strip('"')
        if not path.startswith(allowed_prefix):
            dirty.append(path)
    return dirty


def plan_local_run(
    root: Path, paths: List[str], sha: str
) -> Tuple[List[str], Path, Dict[str, str]]:
    cmd = [sys.executable, '-m', 'pytest', '--tb=short', *paths]
    env = {'CONSISTENCY_REGEN': '1', 'CONSISTENCY_GIT_SHA': sha}
    return cmd, root / ENGINE_DIR, env


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description='Regenerate consistency references in the current environment'
    )
    parser.add_argument('paths', nargs='*', default=['tests/consistency'])
    args = parser.parse_args(argv)

    root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
    status = subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True)
    dirty = check_clean(status, ALLOWED_PREFIX)
    if dirty:
        print('Refusing to regenerate: dirty paths outside tests/consistency:', file=sys.stderr)
        for path in dirty:
            print(f'  {path}', file=sys.stderr)
        return 1

    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    cmd, cwd, extra_env = plan_local_run(root, args.paths, sha)
    result = subprocess.run(cmd, cwd=cwd, env={**os.environ, **extra_env}, check=False)
    if result.returncode != 0:
        print(
            'pytest failed in regen mode; refs may be partly rewritten, '
            'review `git status` before keeping them',
            file=sys.stderr,
        )
    return result.returncode


if __name__ == '__main__':
    sys.exit(main())
