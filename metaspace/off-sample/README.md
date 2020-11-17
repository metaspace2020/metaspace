# Intro
Simple API for classifying Imaging Mass Spectrometry Ion images as on/off sample

# Setup
Inside root directory

By default, Dockerfile expects a Fastai model file at `./models/model.fai.pth` path.

```
docker build -t metaspace2020/off-sample -f docker/Dockerfile .
docker run -d -p 9876:8000 --name off-sample metaspace2020/off-sample
```

# Using API

The API will be available at [http://localhost:9876](http://localhost:9876)

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

## Acknowledgements and license

[See the top-level README](../../README.md#acknowledgements)