```bash
npm install -g elasticdump

elasticdump \
  --input=http://localhost:9200/sm \
  --output=$ \
  --type=mapping \
  | gzip > /tmp/sm_index_settings.json.gz

elasticdump \
  --input=http://localhost:9200/sm \
  --output=$ \
  --type=data \
  | gzip > /tmp/sm_index_data.json.gz
```