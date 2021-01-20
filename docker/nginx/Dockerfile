FROM nginx:1.19.6-alpine

RUN rm -rf /etc/nginx/sites-enabled && \
    rm /etc/nginx/nginx.conf && \
    rm /etc/nginx/conf.d/* && \
    ln -s /nginx/config/sites-enabled /etc/nginx/sites-enabled && \
    ln -s /nginx/config/nginx.conf /etc/nginx/nginx.conf && \
    ln -s /nginx/config/proxy-params.conf /etc/nginx/proxy-params.conf
