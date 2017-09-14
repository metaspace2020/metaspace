from setuptools import setup, find_packages

from sm_annotation_utils import __version__

setup(name='sm_annotation_utils',
      version=__version__,
      description='Python library for working with sm-engine annotations',
      url='https://github.com/spatialmetabolomics/sm-analytics-python',
      author='Alexandrov Team, EMBL',
      packages=find_packages(),
      install_requires=[
          'elasticsearch==2.3.0',
          'elasticsearch_dsl==2.2.0',
          'pandas',
          'plotly>=1.12',
          'numpy',
          'pyyaml',
          'psycopg2',
          'pyMSpec',
          'matplotlib'
      ])
