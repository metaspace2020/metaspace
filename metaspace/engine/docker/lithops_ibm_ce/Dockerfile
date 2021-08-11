FROM python:3.8-slim-buster

RUN apt-get update \
    && apt-get install -y \
        unzip \
    && rm -rf /var/lib/apt/lists/* \
    && apt-cache search linux-headers-generic


RUN pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir \
        cloudpickle \
        flask \
        gevent \
        gunicorn \
        httplib2 \
        ibm-cos-sdk \
        # kafka \
        # lxml \
        # numpy \
        # pandas \
        pika \
        ps-mem \
        # python-dateutil \
        redis \
        requests \
        # simplejson \
        tblib

ENV PORT 8080
ENV CONCURRENCY 4
ENV TIMEOUT 600
ENV PYTHONUNBUFFERED TRUE

# Copy Lithops proxy and lib to the container image.
ENV APP_HOME /lithops
WORKDIR $APP_HOME

COPY lithops_codeengine.zip .
RUN unzip lithops_codeengine.zip && rm lithops_codeengine.zip

# Install M\ requirements
COPY requirements.txt /tmp/requirements.txt
RUN grep -E "^(c?pyMSpec|c?pyImagingMSpec|numpy|scipy|pandas|msgpack|pyimzML|pyarrow|scikit-learn|Pillow|boto3)" /tmp/requirements.txt > /tmp/requirements-lithops.txt
RUN pip install --no-cache-dir -r /tmp/requirements-lithops.txt

CMD exec gunicorn --bind :$PORT --workers $CONCURRENCY --timeout $TIMEOUT lithopsentry:proxy