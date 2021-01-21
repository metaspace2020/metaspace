import numpy as np


def sort_chunk(imzml_parser, start_i=0, size=10):
    # peak_list = []
    mz_list, int_list, idx_list = [], [], []
    for idx in range(start_i, start_i + size):
        if idx >= len(imzml_parser.coordinates):
            break
        mzs, ints = imzml_parser.getspectrum(idx)
        peak_n = mzs.shape[0]
        mz_list.append(mzs.astype('f'))
        int_list.append(ints.astype('f'))
        idx_list.append(np.ones((peak_n,), dtype='f'))
        # peak_list.append(peaks)

    comb_mzs = np.concatenate(mz_list)
    by_mz = comb_mzs.argsort(kind="mergesort")
    chunk_peak_n = comb_mzs.shape[0]
    chunk_peaks = np.zeros((chunk_peak_n, 3), dtype="f")
    chunk_peaks[:, 0] = comb_mzs[by_mz]
    chunk_peaks[:, 1] = np.concatenate(int_list)[by_mz]
    chunk_peaks[:, 2] = np.concatenate(idx_list)[by_mz]
    return chunk_peaks


def sort_dataset_chunks(sorted_chunks_path, chunk_n, chunk_size):
    for i in range(chunk_n):
        print(f"Saving chunk {i}")
        combined_peaks = sort_chunk(i * chunk_size, chunk_size)
        # f_path = sorted_chunks_path / f"chunk-{start_i}:{i}"
        # pickle.dump(combined_peaks, f_path.open("wb"))
        f_path = sorted_chunks_path / f"chunk-{i}.bin"
        combined_peaks.tofile(f_path.open("wb"))


def merge2(sorted_chunks_path, chunk_n, sorted_mzs_path):
    chunk_arrays = []
    # chunk_sizes = []
    for i in range(chunk_n):
        f_path = sorted_chunks_path / f"chunk-{i}.bin"
        # chunk_sizes.append(f_path.stat().st_size)
        a = np.fromfile(f_path, dtype='f')
        chunk_arrays.append(a)

    all_arrays = np.concatenate(chunk_arrays)
    all_arrays.sort(kind="mergesort")
    all_arrays.tofile(sorted_mzs_path)


BYTES_PER_FIELD = 4
NUM_FIELDS = 3
BYTES_PER_RECORD = NUM_FIELDS * BYTES_PER_FIELD


def merge3(sorted_chunks_path, chunk_n, sorted_mzs_path):
    total_size = 0
    with sorted_mzs_path.open("wb") as out_stream:
        for i in range(chunk_n):
            chunk_path = sorted_chunks_path / f"chunk-{i}.bin"
            bytes = chunk_path.read_bytes()
            total_size += len(bytes)
            out_stream.write(bytes)
    total_record_n = total_size // BYTES_PER_FIELD

    mmap = np.memmap(sorted_mzs_path, dtype="f", mode="r+", shape=(total_record_n, NUM_FIELDS))
    mmap.view(dtype="f,f,f").sort(axis=0, kind="mergesort", order="f0")
    del mmap
