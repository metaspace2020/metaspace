FROM python:3.8.18-slim

RUN apt-get update \
    # Install aws-lambda-cpp build dependencies
    && apt-get install -y \
      unzip \
    # cleanup package lists, they are not used anymore in this image
    && rm -rf /var/lib/apt/lists/* \
    && apt-cache search linux-headers-generic

# Update pip
RUN pip install --upgrade --ignore-installed pip wheel six setuptools \
    && pip install --upgrade --no-cache-dir --ignore-installed \
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

ARG FUNCTION_DIR="/function"

# Copy function code
RUN mkdir -p ${FUNCTION_DIR}

# Set working directory to function root directory
WORKDIR ${FUNCTION_DIR}

# Add Lithops
COPY lithops_lambda.zip .
RUN unzip lithops_lambda.zip \
    && rm lithops_lambda.zip \
    && mkdir handler \
    && touch handler/__init__.py \
    && mv entry_point.py handler/

# Install M\ requirements
COPY requirements.txt /tmp/requirements.txt
RUN grep -E "^(c?pyMSpec|c?pyImagingMSpec|numpy|scipy|pandas|msgpack|pyimzML|pyarrow|scikit-learn|Pillow|boto3)" /tmp/requirements.txt > /tmp/requirements-lithops.txt
# CatBoost installs large optional dependencies (plotly, matplotlib), so install it with --no-deps
RUN grep -E "^(catboost)" /tmp/requirements.txt > /tmp/requirements-catboost.txt
RUN pip install --no-cache-dir -r /tmp/requirements-lithops.txt && pip install --no-cache-dir -r /tmp/requirements-catboost.txt --no-deps


ENTRYPOINT [ "/usr/local/bin/python", "-m", "awslambdaric" ]
CMD [ "handler.entry_point.lambda_handler" ]
