mkdir -p tmp
cd tmp

DUMPS=https://s3-eu-west-1.amazonaws.com/embl-sm-testing/dumps/2018-04-13

wget -q $DUMPS/sm_index_settings.json.gz
gunzip -f sm_index_settings.json.gz
curl -s -XPUT http://localhost:9200/sm -d @sm_index_settings.json

wget -qN $DUMPS/sm_index_data.json.gz
zcat sm_index_data.json.gz | elasticdump --input=$ --output=http://localhost:9200/sm --limit 1000
