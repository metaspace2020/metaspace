FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY metaspace/postprocessing/image_segmentation/requirements-engine-path.txt .
RUN pip install --no-cache-dir -r requirements-engine-path.txt

COPY metaspace/postprocessing/image_segmentation/app.py .
COPY metaspace/postprocessing/image_segmentation/image_segmentation ./image_segmentation
COPY metaspace/postprocessing/image_segmentation/conf ./conf

EXPOSE 9877

CMD ["python", "app.py"]
