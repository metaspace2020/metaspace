FROM --platform=linux/amd64 ubuntu:26.04

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git curl wget nano netcat-openbsd sudo ca-certificates adduser \
    libpq-dev postgresql-client libsm6 libxrender1 libxext6 \
    python3 python3-dev python3-venv \
 && rm -rf /var/lib/apt/lists/*

# Keep uid 1000 — bind-mount ownership and the compose SM_USER contract depend on it.
# ubuntu:24.04+ images ship a default 'ubuntu' user that already owns uid 1000 — remove it first.
RUN userdel -r ubuntu 2>/dev/null || true \
 && adduser --disabled-password --uid 1000 --gecos "" sm-engine \
 && echo "sm-engine ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Create the venv's parent dir owned by sm-engine so it (and everything pip writes
# into it below) is populated by that user directly — no post-hoc chown -R of a
# populated tree, which would bloat this layer.
RUN mkdir /opt/venv && chown sm-engine:sm-engine /opt/venv

COPY metaspace/engine/requirements.txt metaspace/engine/requirements-dev.txt /

# Ubuntu 23.04+ marks the system Python externally-managed (PEP 668) — a venv is required.
# It also mirrors prod more closely, where the engine runs in its own conda env, not system python.
# Run as sm-engine so /opt/venv (and everything installed into it) ends up owned by the
# runtime user — this is what lets start-common.sh's startup `pip install -qr requirements.txt`
# actually work instead of silently no-op'ing against a root-owned venv.
USER sm-engine
ENV PATH=/opt/venv/bin:$PATH
RUN python3 -m venv /opt/venv \
 && pip install --no-cache-dir --upgrade pip setuptools \
 && pip install --no-cache-dir -r /requirements.txt -r /requirements-dev.txt
USER root

ENTRYPOINT [ ]
CMD [ "/sm-engine/start-api.sh" ]
