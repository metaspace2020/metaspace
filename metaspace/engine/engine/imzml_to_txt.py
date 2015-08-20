#!/usr/bin/python2.7
# -*- coding: utf-8 -*-

import sys

from python_to_txt import encode_data_line, encode_coord_line
from pyimzml.ImzMLParser import ImzMLParser
import numpy as np

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
    if preprocess:
        import scipy.signal as signal
        from pyMS.centroid_detection import gradient
    max_x, max_y = 0,0
    print("Starting conversion...")
    n_pixels = len(parser.coordinates)
    for i,(x,y) in enumerate(parser.coordinates):
        mz_arr, int_arr = parser.getspectrum(i)
        if preprocess:
            int_arr = signal.savgol_filter(int_arr, 5, 2)
            mz_arr, int_arr,_ = gradient(np.asarray(mz_arr), np.asarray(int_arr), max_output=-1, weighted_bins=3)
        data_file.write(encode_data_line(i, int_arr, mz_arr) + '\n')
        if coord_file:
            coord_file.write(encode_coord_line(i,x,y) + '\n')
        max_x = max(max_x, x)
        max_y = max(max_y, y)
        if i % (n_pixels/100) == 0 and print_progress:
            print("Wrote %.1f%% (%d of %d)" % (float(i)/n_pixels*100, i, n_pixels))
    print("Finished.")
    return max_x, max_y

if __name__=="__main__":
    try:
        imzml_fn = sys.argv[1]
        data_fp = open(sys.argv[2], 'w')
    except IndexError:
        print """
Usage: imzml_to_txt.py <imput file> <data output file> [<coordinate output file]"""
    coord_fp = open(sys.argv[3], 'w') if len(sys.argv) > 3 else None
    do_write(ImzMLParser(imzml_fn), data_fp, coord_fp, preprocess=True, print_progress=True)
