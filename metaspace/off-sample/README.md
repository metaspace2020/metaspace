# Intro
Simple API for classifying Imaging Mass Spectrometry Ion images as on/off sample

# Setup
Inside root directory

```
docker build -t metaspace2020/off-sample -f docker/Dockerfile
docker run -d -p 8000:8000 --name off-sample metaspace2020/off-sample
```

# Using API

The API will be available at [http://localhost:8000](http://localhost:8000)

It accepts POST requests with JSON, images must be Base64 encoded, max 32 per request:

```
{
    "images": [
        {
            "content": "<Base64 encoded image>"
        },
        ...
    ]
}
```


Jupyter [notebook](api-example.ipynb) with API use example
