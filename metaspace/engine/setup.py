from setuptools import setup, find_packages

from sm import __version__

setup(name='sm',
      version=__version__,
      description='High throughput molecules annotation for imaging mass spectrometry data sets',
      url='https://github.com/metaspace2020/metaspace/tree/master/metaspace/engine',
      author='Alexandrov Team, EMBL',
      author_email='vitaly.kovalev@embl.de',
      packages=find_packages(),
      install_requires=[
          "pyImagingMSpec==0.1.4",
          "cpyImagingMSpec==0.2.4",
          "pyMSpec==0.1.2",
          "cpyMSpec==0.3.5",  # Drop all isotopic patterns if updated!
          "pyimzML==1.2.4",
          "requests",
          "pytest",
          "recommonmark",
          "boto3",
          "fabric3",
          "pypng",
          "pyyaml",
          "elasticsearch",
          "elasticsearch_dsl",
          "pika==0.11.0b1",
          "bottle",
          "pyspark==2.3.0",
          "pysparkling",
          "PyArrow>=0.8.0",
          "Pillow==4.2.1",
          "pyopenms==2.2.0",
          "numpy>=1.11.2",
          "scipy>=0.18.1",
          "matplotlib>=2",
          "pandas>=0.22",
          "cffi",
          "psycopg2==2.7.1",
      ],
      dependency_links=[
          "git+https://github.com/alexandrovteam/pyimzML.git/@1.2.4#egg=pyimzML-1.2.4"
      ])
