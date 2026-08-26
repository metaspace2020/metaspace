FROM python:3.14-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Heavy scientific deps come from image_segmentation's requirements.
COPY metaspace/postprocessing/image_segmentation/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

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
