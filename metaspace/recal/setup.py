# -*- coding: utf-8 -*-
import os
import platform
import re
import subprocess
import sys
from distutils.version import LooseVersion

from setuptools import setup, find_packages, Extension
from setuptools.command.build_ext import build_ext


def fix_includes_hack():
    # IDK what happened to the GitHub Actions container image, but suddenly the build started
    # failing on Windows with this error:
    # MSIWarp\src\lib\warp\warp.cpp(375,32): error C3861: 'back_inserter': identifier not found
    header_contents = open('MSIWarp/src/lib/warp/warp.hpp', 'rt').read()
    if '<iterator>' not in header_contents:
        header_contents = header_contents.replace(
            '#include <vector>', '#include <vector>\n#include <iterator>'
        )
        open('MSIWarp/src/lib/warp/warp.hpp', 'wt').write(header_contents)


## This CMakeExtension stuff is part of MSIWarp vendoring (bundling a built copy of their library with our library)
## It's hacky and should be removed as soon as there's a MSIWarp package available on PyPI


class CMakeExtension(Extension):
    def __init__(self, name, sourcedir=''):
        Extension.__init__(self, name, sources=[])
        self.sourcedir = os.path.abspath(sourcedir)


class CMakeBuild(build_ext):
    def run(self):
        fix_includes_hack()

        try:
            out = subprocess.check_output(['cmake', '--version'])
        except OSError:
            raise RuntimeError(
                "CMake must be installed to build the following extensions: "
                + ", ".join(e.name for e in self.extensions)
            )
        if platform.system() == "Windows":
            cmake_version = LooseVersion(re.search(r'version\s*([\d.]+)', out.decode()).group(1))
            if cmake_version < '3.1.0':
                raise RuntimeError("CMake >= 3.1.0 is required on Windows")
        for ext in self.extensions:
            self.build_extension(ext)

    def build_extension(self, ext):
        extdir = os.path.abspath(os.path.dirname(self.get_ext_fullpath(ext.name)))
        cmake_args = [
            '-DCMAKE_LIBRARY_OUTPUT_DIRECTORY=' + extdir,
            '-DPYTHON_EXECUTABLE=' + sys.executable,
        ]
        cfg = 'Debug' if self.debug else 'Release'
        build_args = ['--config', cfg]
        if platform.system() == "Windows":
            cmake_args += ['-DCMAKE_LIBRARY_OUTPUT_DIRECTORY_{}={}'.format(cfg.upper(), extdir)]
            if sys.maxsize > 2 ** 32:
                cmake_args += ['-A', 'x64']
            build_args += ['--', '/m']
        else:
            cmake_args += ['-DCMAKE_BUILD_TYPE=' + cfg]
            build_args += ['--', '-j2']
        env = os.environ.copy()
        env['CXXFLAGS'] = '{} -DVERSION_INFO=\\"{}\\"'.format(
            env.get('CXXFLAGS', ''), self.distribution.get_version()
        )
        if not os.path.exists(self.build_temp):
            os.makedirs(self.build_temp)
        subprocess.check_call(['cmake', ext.sourcedir] + cmake_args, cwd=self.build_temp, env=env)
        subprocess.check_call(['cmake', '--build', '.'] + build_args, cwd=self.build_temp)
        print()  # Add an empty line for cleaner output


setup(
    name='msi_recal',
    version='0.2.3',
    description='Pipeline for mostly unsupervised recalibration of imzML mass spectrometry data',
    url='https://github.com/metaspace2020/metaspace/tree/master/metaspace/recal',
    author='Alexandrov Team, EMBL',
    package_dir={
        'msiwarp': 'MSIWarp/src/python-bindings/msiwarp',
        '': '.',
    },
    packages=[*find_packages(), 'msiwarp', 'msiwarp.util'],
    package_data={'msi_recal': ['dbs/*.csv']},
    install_requires=[
        'numpy',
        'scipy',
        'matplotlib',
        'seaborn',
        'pyimzml',
        'pyMSpec',
        'cpyMSpec',
        'scikit-learn',
        'typing-extensions; python_version < "3.8"',
    ],
    # Vendorize MSIWarp because it's not on PyPI yet
    ext_modules=[CMakeExtension('msiwarp/msiwarp_cpp')],
    cmdclass={"build_ext": CMakeBuild},
)
