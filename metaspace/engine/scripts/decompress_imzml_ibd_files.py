# %%
import argparse
import hashlib
import subprocess
from pathlib import Path


def calc_md5_hash(file_path, chunk_size=1024 * 1024):
    """Calculate md5 hash for file chunk by chunk."""
    md5_hash = hashlib.md5()
    with open(file_path, 'rb') as f:
        chunk = f.read(chunk_size)
        while chunk:
            md5_hash.update(chunk)
            chunk = f.read(chunk_size)

    return md5_hash.hexdigest()


def read_md5_hash(file_path):
    with open(file_path, 'r') as f:
        return f.readline().strip().split('  ')[0]


def decompress_files(root_path):
    path = Path(root_path)

    for child in path.glob('**/*'):
        print(child)
        if child.suffix in ['.bzip2', '.7z']:
            # decompress file
            cmd_str = f'7zzs e "{child}" -o"{child.parent}" > /dev/null'
            subprocess.run(cmd_str, shell=True, check=True)

            # calc md5 hash and compare with existed
            original_filename = f'{child.parent}/{child.stem}'
            md5_hash_original = read_md5_hash(f'{original_filename}.md5')
            md5_hash_calc = calc_md5_hash(original_filename)
            assert md5_hash_original == md5_hash_calc

            # remove compressed file
            file = Path(child)
            file.unlink()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Decompress imzML/ibd files')
    parser.add_argument(
        '--root-path', dest='root_path', type=str, help='The path to the directory with the files'
    )
    args = parser.parse_args()

    root_path = args.root_path
    decompress_files(root_path)
