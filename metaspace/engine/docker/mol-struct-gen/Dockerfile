FROM ubuntu:20.04

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get -y install --no-install-recommends\
  build-essential\
  ca-certificates\
  cmake\
  git\
  zlib1g-dev\
  libcairo2-dev\
  libboost-dev\
  libboost-program-options-dev\
  libboost-iostreams-dev\
  libboost-regex-dev\
  rapidjson-dev\
  python3-dev\
  libbz2-dev\
  libeigen3-dev\
  libxml2-dev\
  swig3.0\
  lzma\
  wget &&\
  apt-get clean -y

WORKDIR /root
RUN git clone https://github.com/openbabel/openbabel.git && \
  cd openbabel

WORKDIR /root/openbabel/build
RUN cmake ..\
  -DPYTHON_EXECUTABLE=/usr/bin/python3\
  -DPYTHON_BINDINGS=ON\
  -DRUN_SWIG=ON\
  -DWITH_MAEPARSER=off &&\
  nproc=$(getconf _NPROCESSORS_ONLN) &&\
  make -j $(( nproc > 2 ? nproc - 2 : 1 )) &&\
  make install &&\
  cd /root/openbabel &&\
  rm -rf build/*

RUN ln -s -T /usr/bin/python3 /usr/bin/python && \
    apt-get update && \
    apt-get install -yq --no-install-recommends \
        python3-pip \
        python3-setuptools && \
    python -m pip install \
        pandas
#        jupyter

EXPOSE 8888

RUN useradd -u 1000 -g 0 -m obabel
USER 1000
WORKDIR /home/obabel/mol-struct-gen

COPY main.py /home/obabel

#CMD jupyter notebook \
#    --ip 0.0.0.0 \
#    --config=/home/obabel/.jupyter/jupyter_notebook_config.json

ENTRYPOINT ["python", "/home/obabel/main.py"]
CMD ["-h"]
