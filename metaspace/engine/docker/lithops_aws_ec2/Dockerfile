FROM python:3.8.20-slim

ENV FLASK_PROXY_PORT 8080

RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir \
        cloudpickle==3.0.0 \
        flask==2.3.3 \
        gevent==21.8.0 \
        pika==1.3.2 \
        ps-mem==3.14 \
        redis==5.0.8 \
        requests==2.29.0 \
        tblib==3.0.0

COPY requirements.txt /tmp/requirements.txt
RUN grep -E "^(c?pyMSpec|c?pyImagingMSpec|numpy|scipy|pandas|msgpack|pyimzML|pyarrow|scikit-learn|Pillow|boto3)" /tmp/requirements.txt > /tmp/requirements-lithops.txt
# CatBoost installs large optional dependencies (plotly, matplotlib), so install it with --no-deps
RUN grep -E "^(catboost)" /tmp/requirements.txt > /tmp/requirements-catboost.txt
RUN pip install --no-cache-dir -r /tmp/requirements-lithops.txt && pip install --no-cache-dir -r /tmp/requirements-catboost.txt --no-deps

# create action working directory
RUN mkdir -p /action \
    && mkdir -p /actionProxy \
    && mkdir -p /pythonAction

ADD https://raw.githubusercontent.com/apache/openwhisk-runtime-docker/8b2e205c39d84ed5ede6b1b08cccf314a2b13105/core/actionProxy/actionproxy.py /actionProxy/actionproxy.py
ADD https://raw.githubusercontent.com/apache/openwhisk-runtime-python/3%401.0.3/core/pythonAction/pythonrunner.py /pythonAction/pythonrunner.py

CMD ["/bin/bash", "-c", "cd /pythonAction && python -u pythonrunner.py"]
