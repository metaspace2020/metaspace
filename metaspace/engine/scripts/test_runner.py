#!/usr/bin/env python
"""
test_runner
-----------
A handy module for easy tests running
"""

from os import path
from fabric.api import local
from fabric.context_managers import lcd
import argparse


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Test runner for SM engine')
    parser.add_argument('-u', '--unit', action='store_true', help='run unit tests only')
    parser.add_argument('-r', '--regr', action='store_true', help='run regression tests only')
    parser.add_argument('-s', '--sci', action='store_true', help='run scientific tests only')
    parser.add_argument('-a', '--all', action='store_true', help='run all tests')

    args = parser.parse_args()
    print(args)

    py_test_cmd = 'py.test -x -v '

    with lcd(path.dirname(path.dirname(__file__))):
        # Engine unit tests
        if args.unit or args.all:
            local(py_test_cmd + 'sm/engine/tests')

        # Regression tests
        if args.regr or args.all:
            local(py_test_cmd + 'tests')

        # Functional/scientific tests
        if args.sci or args.all:
            local('python tests/sci_test_spheroid.py --run')

        if args.unit or args.all or args.regr:
            print('ALL TESTS FINISHED SUCCESSFULLY')
        elif args.sci:
            print('SCI TEST FINISHED')
        else:
            parser.print_help()
