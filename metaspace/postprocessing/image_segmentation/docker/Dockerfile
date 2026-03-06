FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY metaspace/postprocessing/image_segmentation/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY metaspace/postprocessing/image_segmentation/app.py .
COPY metaspace/postprocessing/image_segmentation/image_segmentation ./image_segmentation

EXPOSE 9877

CMD ["python", "-m", "uvicorn", "image_segmentation.app:app", "--host", "0.0.0.0", "--port", "9877"]
