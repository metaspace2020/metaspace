from setuptools import setup, find_packages

from metaspace import __version__

setup(
    name='metaspace2020',
    version=__version__,
    description='Python library for connecting to the METASPACE platform',
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    url='https://github.com/metaspace2020/metaspace/tree/master/metaspace/python-client',
    author='Alexandrov Team, EMBL',
    author_email='contact@metaspace2020.eu',
    packages=find_packages(exclude=['*tests*']),
    install_requires=[
        'pandas',
        'plotly>=1.12',
        'numpy',
        'matplotlib',
        'pyMSpec',
        'pillow',
        'requests',
    ],
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
        "Topic :: Scientific/Engineering :: Bio-Informatics",
        "Intended Audience :: Science/Research",
    ],
)
