import pathlib
import shutil


def list_file_sizes(bucket):
    obj_sizes = {}
    i = 0
    for obj in bucket.objects.all():
        obj_sizes[obj.key] = obj.size
        i += 1
        if i % 1000:
            print(f"{i} objects")

    obj_sizes = sorted(obj_sizes.items(), key=lambda kv: kv[1], reverse=True)

    obj_sizes_5gbmax = [(key, size) for key, size in obj_sizes if size < 5 * 1024 ** 3]
    for i in range(10):
        key, size = obj_sizes_5gbmax[i]
        print(size / 1024 ** 2, key)


def download_dataset(bucket, key_prefix, ds_local_path):
    ds_local_path.mkdir(parents=True, exist_ok=True)
    for obj in bucket.objects.filter(Prefix=key_prefix):
        # print(obj)
        fn = obj.key.split('/')[-1]
        f_path = ds_local_path / fn
        if not f_path.exists():
            bucket.download_file(obj.key, str(f_path))


def get_file_by_ext(path, ext):
    return [f_path for f_path in path.iterdir() if str(f_path).lower().endswith(ext)][0]


def clean_dir(path):
    shutil.rmtree(path, ignore_errors=True)
    path.mkdir(parents=True, exist_ok=True)


def mz_ppm_bin(mz, ppm):
    return mz - mz * ppm * 1e-6, mz + mz * ppm * 1e-6
