# linux/amd64 matches docker/sm-engine/Dockerfile; sklearn 0.23.2 has no aarch64 wheels on PyPI.
FROM --platform=linux/amd64 python:3.8-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY metaspace/postprocessing/image_segmentation/requirements.txt .
# Pip's default build isolation installs a fresh setuptools that breaks numpy.distutils when
# building scikit-learn 0.23.2 from source. Use the image Python's distutils + setuptools<60.
RUN pip install --no-cache-dir "pip>=21.3,<24.1" "setuptools==59.8.0" wheel \
    && awk '!/^scikit-learn==/' requirements.txt > /tmp/requirements-without-sklearn.txt \
    && pip install --no-cache-dir -r /tmp/requirements-without-sklearn.txt \
    && pip install --no-cache-dir "setuptools==59.8.0" \
    && pip install --no-cache-dir --no-build-isolation "scikit-learn==0.23.2" \
    && rm -f /tmp/requirements-without-sklearn.txt

COPY metaspace/postprocessing/image_segmentation/app.py .
COPY metaspace/postprocessing/image_segmentation/image_segmentation ./image_segmentation
COPY metaspace/postprocessing/image_segmentation/conf ./conf

EXPOSE 9877

CMD ["python", "app.py"]
