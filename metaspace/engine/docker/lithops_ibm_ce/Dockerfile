FROM python:3.8.12-slim-buster

RUN apt-get update \
    && apt-get install -y \
        unzip \
    && rm -rf /var/lib/apt/lists/* \
    && apt-cache search linux-headers-generic


RUN pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir \
        cloudpickle==1.6.0 \
        flask==2.0.1 \
        gunicorn==20.1.0 \
        ibm-cos-sdk==2.10.0 \
        pika==1.2.0 \
        ps-mem==3.12 \
        redis==3.5.3 \
        requests==2.26.0 \
        tblib==1.7.0

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