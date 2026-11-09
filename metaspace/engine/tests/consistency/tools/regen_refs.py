import argparse
import subprocess
import sys
from pathlib import Path
from typing import List

ALLOWED_PREFIX = 'metaspace/engine/tests/consistency/'
CONTAINER_REF_DIR = '/tmp/engine-tests/tests/consistency/refs'


def check_clean(status_text: str, allowed_prefix: str) -> List[str]:
    dirty = []
    for line in status_text.splitlines():
        if not line.strip():
            continue
        path = line[3:].strip().split(' -> ')[-1].strip('"')
        if not path.startswith(allowed_prefix):
            dirty.append(path)
    return dirty


def _run(cmd, **kwargs):
    return subprocess.run(cmd, check=True, **kwargs)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Regenerate consistency references (host side)')
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
    compose = ['docker-compose', '-f', str(root / 'docker' / 'docker-compose.yml')]
    script = root / '.claude' / 'skills' / 'test' / 'scripts' / 'engine-pytest.sh'
    with open(script) as script_file:
        result = subprocess.run(
            compose
            + ['exec', '-T', '-e', 'CONSISTENCY_REGEN=1', '-e', f'CONSISTENCY_GIT_SHA={sha}']
            + ['api', 'bash', '-s', '--']
            + args.paths,
            stdin=script_file,
        )
    if result.returncode != 0:
        print('pytest failed in regen mode; refs not copied back', file=sys.stderr)
        return result.returncode

    container = subprocess.check_output(compose + ['ps', '-q', 'api'], cwd=root, text=True).strip()
    dest = root / 'metaspace' / 'engine' / 'tests' / 'consistency' / 'refs'
    dest.mkdir(parents=True, exist_ok=True)
    _run(['docker', 'cp', f'{container}:{CONTAINER_REF_DIR}/.', str(dest)])
    print(f'references copied to {dest}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
