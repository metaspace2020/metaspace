#!/usr/bin/python
# -*- coding: utf-8 -*-

import sys

from pyimzml.ImzMLParser import ImzMLParser
import numpy as np


def encode_data_line(index, mz_list, int_list, decimals=3):
    '''
    Encodes given spectrum into a line in Sergey's text-based format:
    "index|int_1 int_2 ... int_n|mz_1 mz_2 ... mz_n"
    '''
    if not isinstance(index,int):
        raise TypeError("index must be integer")
    idx_string = str(index)
    mz_list = [round(x, decimals) for x in mz_list]
    int_list = [round(x, decimals) for x in int_list]
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
    return reduce(lambda a,b: "%s %s" % (a,b), seq)


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
    for i, (x, y) in enumerate(parser.coordinates):
        mz_arr, int_arr = parser.getspectrum(i)
        if preprocess:
            int_arr = signal.savgol_filter(int_arr, 5, 2)
            mz_arr, int_arr,_ = gradient(np.asarray(mz_arr), np.asarray(int_arr), max_output=-1, weighted_bins=3)
        data_file.write(encode_data_line(i, mz_arr, int_arr) + '\n')
        if coord_file:
            coord_file.write(encode_coord_line(i, x, y) + '\n')
        max_x = max(max_x, x)
        max_y = max(max_y, y)
        if i % step == 0 and print_progress:
            print("Wrote %.1f%% (%d of %d)" % (float(i)/n_pixels*100, i, n_pixels))
    print("Finished.")
    return max_x, max_y

if __name__=="__main__":
    try:
        imzml_fn = sys.argv[1]
        data_fp = open(sys.argv[2], 'w')
        coord_fp = open(sys.argv[3], 'w') if len(sys.argv) > 3 else None
        # TO-DO: add script parameter - preprocess
        do_write(ImzMLParser(imzml_fn), data_fp, coord_fp, preprocess=False, print_progress=True)
    except IndexError:
        print """\nUsage: imzml_to_txt.py <input file> <data output file> [<coordinate output file]"""
