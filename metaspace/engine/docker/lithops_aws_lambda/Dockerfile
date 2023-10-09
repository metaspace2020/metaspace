# Define custom function directory
ARG FUNCTION_DIR="/function"

FROM python:3.8.16-slim-buster as build-image

# Include global arg in this stage of the build
ARG FUNCTION_DIR

# Install aws-lambda-cpp build dependencies
RUN apt-get update && \
  apt-get install -y \
  g++ \
  make \
  cmake \
  unzip \
  libcurl4-openssl-dev

# Copy function code
RUN mkdir -p ${FUNCTION_DIR}

# Update pip
RUN pip install -U pip wheel six setuptools

# Install the function's dependencies
RUN pip install \
    --target ${FUNCTION_DIR} \
        awslambdaric \
        boto3 \
        redis \
        httplib2 \
        requests \
        pika \
        kafka-python \
        cloudpickle \
        ps-mem \
        tblib


FROM python:3.8.16-slim-buster

RUN apt-get update && apt-get install -y unzip

# Include global arg in this stage of the build
ARG FUNCTION_DIR
# Set working directory to function root directory
WORKDIR ${FUNCTION_DIR}

# Copy in the built dependencies
COPY --from=build-image ${FUNCTION_DIR} ${FUNCTION_DIR}

# Add Lithops
COPY lithops_lambda.zip ${FUNCTION_DIR}
RUN unzip lithops_lambda.zip \
    && rm lithops_lambda.zip \
    && mkdir handler \
    && touch handler/__init__.py \
    && mv entry_point.py handler


RUN pip install --upgrade pip setuptools wheel

# Install M\ requirements
COPY requirements.txt /tmp/requirements.txt
RUN grep -E "^(c?pyMSpec|c?pyImagingMSpec|numpy|scipy|pandas|msgpack|pyimzML|pyarrow|scikit-learn|Pillow|boto3)" /tmp/requirements.txt > /tmp/requirements-lithops.txt
# CatBoost installs large optional dependencies (plotly, matplotlib), so install it with --no-deps
RUN grep -E "^(catboost)" /tmp/requirements.txt > /tmp/requirements-catboost.txt
RUN pip install --no-cache-dir -r /tmp/requirements-lithops.txt && pip install --no-cache-dir -r /tmp/requirements-catboost.txt --no-deps

ENTRYPOINT [ "/usr/local/bin/python", "-m", "awslambdaric" ]
CMD [ "handler.entry_point.lambda_handler" ]
