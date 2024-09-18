FROM python:3.8.20-slim

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
        awslambdaric==2.2.1 \
        boto3==1.35.16 \
        cloudpickle==3.0.0 \
        pika==1.3.2 \
        ps-mem==3.14 \
        redis==5.0.8 \
        requests==2.29.0 \
        tblib==1.7.0

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
