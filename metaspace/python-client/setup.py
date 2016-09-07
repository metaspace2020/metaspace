from setuptools import setup, find_packages

from pyMSpec import __version__

setup(name='pyMSpec',
      version=__version__,
      description='Python library for processing individual mass spectra',
      url='https://github.com/alexandrovteam/pyMSpec',
      author='Alexandrov Team, EMBL',
      packages=find_packages())
