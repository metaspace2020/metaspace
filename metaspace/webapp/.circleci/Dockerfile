FROM node:7.9.0

ENV NPM_CONFIG_LOGLEVEL=warn
RUN npm install -g testcafe elasticdump forever
RUN apt-get update && apt-get install -y postgresql xvfb firefox-esr && apt-get clean