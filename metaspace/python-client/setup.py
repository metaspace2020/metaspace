from setuptools import setup, find_packages


def read_version():
    with open('metaspace/__init__.py') as f:
        version = f.readline().split('=')[1]
        for s in ['\'', '"', '\n', ' ']:
            version = version.replace(s, '')
        return version


setup(
    name='metaspace2020',
    version=read_version(),
    description='Python library for connecting to the METASPACE platform',
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    url='https://github.com/metaspace2020/metaspace/tree/master/metaspace/python-client',
    author='Alexandrov Team, EMBL',
    author_email='contact@metaspace2020.eu',
    packages=find_packages(exclude=['*tests*']),
    install_requires=[
        'matplotlib',
        'numpy',
        'pandas',
        'pillow',
        'plotly>=1.12',
        'requests',
        'tqdm',
    ],
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
        "Topic :: Scientific/Engineering :: Bio-Informatics",
        "Intended Audience :: Science/Research",
    ],
)
