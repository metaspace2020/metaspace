#!/bin/bash

# Example usage
# ~~~~~~~~~~~~~
# ```
# ./reindex-es.sh
# ./reindex-es.sh --ds-id <id>
# ```

args=${@:-'--ds-name "%"'}

docker-compose exec api \
       	bash -c \
	"cd /opt/dev/metaspace/metaspace/engine && python -m scripts.update_es_index $args"
