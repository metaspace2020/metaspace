#!/usr/bin/python
# -*- coding: utf-8 -*-

import sys
import json
import argparse
from pyimzml.ImzMLParser import ImzMLParser
import numpy as np
import psycopg2
from engine import util


def encode_data_line(index, mz_list, int_list, decimals=3):
    '''
    Encodes given spectrum into a line in Sergey's text-based format:
    "index|int_1 int_2 ... int_n|mz_1 mz_2 ... mz_n"
    '''
    if not isinstance(index,int):
        raise TypeError("index must be integer")
    idx_string = str(index)
    mz_list = mz_list.round(decimals)
    int_list = int_list.round(decimals)
    mz_string = to_space_separated_string(mz_list)
    int_string = to_space_separated_string(int_list)
    return "%s|%s|%s" % (idx_string, mz_string, int_string)


def encode_coord_line(index, x, y):
    '''
    Encodes given coordinate into a csv line:
    "index,x,y"
    '''
    if not (isinstance(index,int) and isinstance(x, int) and isinstance(y, int)):
        raise TypeError("parameters must be integer")
    return "%d,%d,%d" % (index, x, y)


def to_space_separated_string(seq):
    return ' '.join(map(str, seq.tolist()))

def do_write(parser, data_file, coord_file=None, preprocess=False, print_progress=False):
    """
    Converts MS imaging data provided by given parser to Sergey's text-based
    format. Optionally writes the coordinates into a coordinate file.
    
    :param parser: the parser to read the dataset
    :param data_file: the output text file for the spectral data
    :param coord_file: the text file for the coordinates. If omitted or None,
    	the coordinates will not be written
    :param preprocess: apply filter and centroid detection to all spectra before
    	writing (rarely useful)
    :param print_progress: whether or not to print progress information to stdout
    
    Returns the maximum x and maximum y coordinate found in the dataset.
    """
    import sys
    from os.path import dirname, realpath
    engine_path = dirname(dirname(realpath(__file__)))
    sys.path.append(engine_path)

    if preprocess:
        import scipy.signal as signal
        from engine.pyMS.centroid_detection import gradient
    max_x, max_y = 0, 0
    print("Starting conversion...")
    n_pixels = len(parser.coordinates)
    step = max(n_pixels/100, 100)
    for i, coord in enumerate(parser.coordinates):
        x, y = coord[:2]
        mz_arr, int_arr = map(np.array, parser.getspectrum(i))
        if preprocess:
            int_arr = signal.savgol_filter(int_arr, 5, 2)
            mz_arr, int_arr,_ = gradient(np.asarray(mz_arr), np.asarray(int_arr), max_output=-1, weighted_bins=3)
            order = mz_arr.argsort()
            mz_arr = mz_arr[order]
            int_arr = int_arr[order]
        data_file.write(encode_data_line(i, mz_arr, int_arr, decimals=9) + '\n')
        if coord_file:
            coord_file.write(encode_coord_line(i, x, y) + '\n')
        max_x = max(max_x, x)
        max_y = max(max_y, y)
        if i % step == 0 and print_progress:
            print("Wrote %.1f%% (%d of %d)" % (float(i)/n_pixels*100, i, n_pixels))
    print("Finished.")
    return max_x, max_y


def save_ds_meta(db_config, imzml_path, coord_path, ds_name, nrows, ncols):
    util.my_print("Inserting to datasets ...")

    conn = psycopg2.connect(**db_config)
    cur = conn.cursor()

    cur.execute("SELECT max(id) FROM dataset")
    try:
        ds_id = cur.fetchone()[0] + 1
    except Exception:
        ds_id = 0
    util.my_print("Inserting to datasets: %d" % ds_id)
    cur.execute("INSERT INTO dataset VALUES (%s, %s, %s, %s, %s)",
                (ds_id, ds_name, imzml_path, nrows, ncols))

    '''
    Insert into coordinates table.
    coordinates table columns: dataset_id, index, x, y
    '''
    util.my_print("Inserting to coordinates ...")
    with open(coord_path) as f:
        cur.execute("ALTER TABLE ONLY coordinates ALTER COLUMN ds_id SET DEFAULT %d" % ds_id)
        cur.copy_from(f, 'coordinates', sep=',', columns=('index', 'x', 'y'))
    conn.commit()
    conn.close()


if __name__=="__main__":
    parser = argparse.ArgumentParser(description='imzML->plain text conversion script')
    parser.add_argument('--imzml', dest='imzml_path', type=str, help='imzml_path')
    parser.add_argument('--data', dest='data_file_path', type=str, help='data_file_path')
    parser.add_argument('--coord', dest='coord_file_path', type=str, help='coord_file_path')
    parser.add_argument('--config', dest='sm_config_path', type=str, help='SM config path')
    parser.add_argument('--ds-config', dest='ds_config_path', type=str, help='dataset config path')
    args = parser.parse_args()

    # SM config
    with open(args.sm_config_path) as f:
        config_db = json.load(f)['db']

    # Dataset config
    with open(args.ds_config_path) as f:
        ds_config = json.load(f)

    try:
        max_x, max_y = do_write(ImzMLParser(args.imzml_path),
                                open(args.data_file_path, 'w'),
                                open(args.coord_file_path, 'w'),
                                preprocess=False, print_progress=True)
        save_ds_meta(config_db, args.imzml_path, args.coord_file_path, ds_config['name'], max_y, max_x)

        print 'Dataset max_x = %d, max_y = %d' % (max_x, max_y)
    except IndexError:
        print """\nUsage: imzml_to_txt.py <input file> <data output file> [<coordinate output file]"""
