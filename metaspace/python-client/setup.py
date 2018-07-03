from setuptools import setup, find_packages

from metaspace import __version__

setup(name='metaspace',
      version=__version__,
      description='Python library for working with sm-engine annotations',
      url='https://github.com/metaspace2020/metaspace/tree/master/metaspace/python-client',
      author='Alexandrov Team, EMBL',
      packages=find_packages(),
      install_requires=[
          'elasticsearch==5.4.0',
          'elasticsearch_dsl==5.3.0',
          'pandas',
          'plotly>=1.12',
          'numpy',
          'pyyaml',
          'psycopg2',
          'matplotlib',
          'pyMSpec',
          'boto3',
      ])
