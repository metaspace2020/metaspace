FROM ibmfunctions/lithops-ce-v385-2:2217b2

# FROM https://raw.githubusercontent.com/lithops-cloud/lithops/d8fb1242d62c9ab62ec3ccc1ab1a1ccd2f651ac0/runtime/code_engine/Dockerfile

COPY requirements.txt /tmp/requirements.txt
RUN grep -E "^(c?pyMSpec|c?pyImagingMSpec|numpy|scipy|pandas|msgpack|pyimzML|pyarrow|scikit-learn|Pillow)" /tmp/requirements.txt > /tmp/requirements-lithops.txt
RUN pip install --no-cache-dir -r /tmp/requirements-lithops.txt
