FROM node:7.9.0-alpine

ENV NPM_CONFIG_LOGLEVEL=warn
RUN npm install -g testcafe elasticdump forever
RUN apk update && apk add --no-cache postgresql xvfb firefox-esr git curl wget bash dbus ttf-freefont