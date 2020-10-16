# Minimal Docker image for PyWren

# Python 3.7.5
FROM python:3.8.5-slim-buster

ENV FLASK_PROXY_PORT 8080

RUN pip install --no-cache-dir --upgrade pip setuptools six \
    && pip install --no-cache-dir \
        simplejson==3.17.2 \
        httplib2==0.18.1 \
        kafka_python==1.4.6 \
        lxml==4.5.2 \
        python-dateutil==2.8.0 \
        pika==0.13.1 \
        flask==1.1.1 \
        gevent==20.9.0 \
        ibm-cos-sdk==2.6.0 \
        redis==3.3.8 \
        requests==2.22.0

COPY requirements.txt /tmp/requirements.txt
RUN grep -E "^(c?pyMSpec|c?pyImagingMSpec|numpy|scipy|pandas|msgpack|pyimzML|pyarrow)" /tmp/requirements.txt > /tmp/requirements-lithops.txt
RUN pip install --no-cache-dir -r /tmp/requirements-lithops.txt

# create action working directory
RUN mkdir -p /action \
    && mkdir -p /actionProxy \
    && mkdir -p /pythonAction

ADD https://raw.githubusercontent.com/apache/openwhisk-runtime-docker/8b2e205c39d84ed5ede6b1b08cccf314a2b13105/core/actionProxy/actionproxy.py /actionProxy/actionproxy.py
ADD https://raw.githubusercontent.com/apache/openwhisk-runtime-python/3%401.0.3/core/pythonAction/pythonrunner.py /pythonAction/pythonrunner.py

CMD ["/bin/bash", "-c", "cd /pythonAction && python -u pythonrunner.py"]
