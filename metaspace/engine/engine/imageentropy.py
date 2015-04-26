import numpy as np
import bisect

from math import log
from collections import Counter

import imaging

def entropy(probability_list):
    """
    Calculates the entropy of a specified discrete probability distribution
    @input probability_list The discrete probability distribution
    """
    running_total = 0

    for item in probability_list:
        running_total += item * log(item, 2)

    if running_total != 0:
        running_total *= -1

    return running_total


def binary_entropy(p0, p1):
    """
    Calculates the binary entropy given two probabilities
    @input p0 Probability of first value
    @input p1 Probability of second value
    The two values must sum to 1.0
    """
    return entropy([p0, p1])


def matrix_entropy(matrix):
    """
    Calculates the "entropy" of a matrix by treating each element as
    independent and obtaining the histogram of element values
    @input matrix
    """
    counts = dict(Counter(matrix.flatten())).values()
    total_count = sum(counts)
    discrete_dist = [float(x) / total_count for x in counts]
    return entropy(discrete_dist)


def profile(matrices):
    """
    Calculates the "profile" (a list of the entropies) of a set of scaled
    filtered matrices as defined in the StackExchange answer
    @input matrices The set of scaled filtered matrices
    """
    return [matrix_entropy(scale) for scale in matrices]

def moving_window_filter(matrix, f, neighborhood_size):
    """
    Applies a filter function to a matrix using a neighborhood size
    @input matrix The matrix to apply the filter function to
    @input f The filter function, such as average, sum, etc.
    @input neighborhood_size The size of the neighborhood for the function
    application
    """
    matrix_height, matrix_width = matrix.shape

    output_matrix = np.zeros([matrix_height - neighborhood_size + 1,
                              matrix_width - neighborhood_size + 1])

    for (row_num, col_num), value in np.ndenumerate(matrix):
        # Check if it already arrived at the right-hand edge as defined by the
        # size of the neighborhood box
        if not ((row_num > (matrix_height - neighborhood_size) or
                col_num > (matrix_width - neighborhood_size))):
            # Obtain each pixel component of an (n x n) 2-dimensional matrix
            # around the input pixel, where n equals neighborhood_size
            component_matrix = np.zeros([neighborhood_size, neighborhood_size])

            for row_offset in range(0, neighborhood_size):
                for column_offset in range(0, neighborhood_size):
                    component_matrix[row_offset][column_offset] = \
                        matrix[row_num + row_offset][col_num + column_offset]

            # Apply the transformation function f to the set of component
            # values obtained from the given neighborhood
            output_matrix[row_num, col_num] = f(component_matrix)

    return output_matrix

def avg_components(component_matrix):
	return np.mean(component_matrix)
    # running_total = 0
    # num_components = 0

    # for (row_num, col_num), value in np.ndenumerate(component_matrix):
    #     running_total += value
    #     num_components += 1

    # output_value = running_total / num_components

    # return output_value


def get_total_entropy_matrix(active_matrix):
	matrices = []
	for n in [3, 5, min(active_matrix.shape) / 4, min(active_matrix.shape) / 2]:
		output_matrix = moving_window_filter(matrix=active_matrix,
                                             f=avg_components,
                                             neighborhood_size=n)
		matrices.append(output_matrix)
	return sum(profile(matrices))

def get_total_entropy_dict(d, nrows, ncols):
	return get_total_entropy_matrix(imaging.make_image_dict(nrows, ncols, d))


