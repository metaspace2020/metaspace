from setuptools import setup, find_packages

setup(
    name='metaspace-image-segmentation',
    version='1.0.0',
    description='METASPACE Image Segmentation Service',
    url='https://github.com/metaspace2020/metaspace',
    author='METASPACE Team',
    packages=find_packages(),
    python_requires='>=3.8,<3.12',  # Compatible with engine requirements
    install_requires=[
        # Read from requirements.txt
    ],
    classifiers=[
        'Intended Audience :: Science/Research',
        'Programming Language :: Python :: 3.8',
    ],
)