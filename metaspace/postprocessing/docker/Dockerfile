# linux/amd64 matches docker/sm-engine/Dockerfile; sklearn 0.23.2 has no aarch64 wheels on PyPI.
FROM --platform=linux/amd64 python:3.8-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Heavy scientific deps come from image_segmentation's requirements.
COPY metaspace/postprocessing/image_segmentation/requirements.txt .
# Pip's default build isolation installs a fresh setuptools that breaks numpy.distutils when
# building scikit-learn 0.23.2 from source. Use the image Python's distutils + setuptools<60.
RUN pip install --no-cache-dir "pip>=21.3,<24.1" "setuptools==59.8.0" wheel \
    && awk '!/^scikit-learn==/' requirements.txt > /tmp/requirements-without-sklearn.txt \
    && pip install --no-cache-dir -r /tmp/requirements-without-sklearn.txt \
    && pip install --no-cache-dir "setuptools==59.8.0" \
    && pip install --no-cache-dir --no-build-isolation "scikit-learn==0.23.2" \
    && rm -f /tmp/requirements-without-sklearn.txt

# Install the four postprocessing packages in editable mode so the
# docker-compose live source mounts (mounted at the same paths) take effect.
COPY metaspace/postprocessing/shared              ./shared_pkg
COPY metaspace/postprocessing/image_segmentation  ./image_segmentation_pkg
COPY metaspace/postprocessing/stats_analysis      ./stats_analysis_pkg
COPY metaspace/postprocessing/server              ./server_pkg
COPY metaspace/postprocessing/conf                ./conf

RUN pip install --no-cache-dir -r ./stats_analysis_pkg/requirements.txt \
    && pip install --no-cache-dir -e ./shared_pkg \
    && pip install --no-cache-dir -e ./image_segmentation_pkg \
    && pip install --no-cache-dir -e ./stats_analysis_pkg \
    && pip install --no-cache-dir -e ./server_pkg

ENV POSTPROCESSING_CONFIG=/app/conf/config.json

EXPOSE 9877

CMD ["python", "-m", "postprocessing_server.app"]
