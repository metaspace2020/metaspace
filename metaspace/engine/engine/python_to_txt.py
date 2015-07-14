#!/usr/bin/python2.7

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