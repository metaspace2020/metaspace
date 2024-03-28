def format_size(bytes_val, precision=2):
    """
    Format a size in bytes into a more understandable representation
    (e.g., KB, MB, GB, TB).

    :param bytes_val: Size in bytes.
    :param precision: Decimal precision of the result.
    :return: A string representation of the size with an appropriate unit.
    """
    units = ['B', 'KB', 'MB', 'GB']
    bytes_val = max(bytes_val, 0)
    power = min((len(units) - 1), (bytes_val.bit_length() - 1) // 10)
    # Divide bytes by 1024 to the power of the unit index
    converted = bytes_val / (1024 ** power)
    return f"{converted:.{precision}f} {units[power]}"
