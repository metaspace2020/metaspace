from setuptools import setup, find_packages

from sm import __version__

setup(name='sm',
      version=__version__,
      description='High throughput molecules annotation for imaging mass spectrometry data sets',
      url='https://github.com/SpatialMetabolomics/SM_distributed.git',
      author='Alexandrov Team, EMBL',
      packages=find_packages())
