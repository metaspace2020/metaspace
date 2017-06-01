- Web application upload: support local folder
- Spark cluster: start locally and not on spot instances
  - job daemon simply needs to run all the time
  - no need for cluster_auto_start_daemon
  - pyspark needs to be installed locally, such as
```bash
cd /opt/dev/
export SPARK_DIR=spark-2.0.2-bin-hadoop2.7                                                                                                                                                                                                         
#wget -qO - http://apache.lauf-forum.at/spark/spark-2.0.2/$SPARK_DIR.tgz | tar xz
export SPARK_HOME=`pwd`/spark-2.0.2-bin-hadoop2.7
export PYTHONPATH=`pwd`/sm:`pwd`/$SPARK_DIR/python:$PYTHONPATH
```

- SM REST API: needs bottle installed (not in the dependencies somehow)
- nginx configuration: client_max_body_size must be set to a larger value (e.g. 5M)
  - default is just 1M which is way too small
  - fine-uploader uses 2M for chunks by default

- SM webapp: 
  - shouldn't use Google OAuth or AWS [done]
    - users can't login at all, we can introduce local mode with a single always logged-in admin 
  - COOKIE_SECRET is required to be set
  - use UPLOAD_DESTINATION="local"
    - also in clientConfig
  - graphql port on the client must be set to web_app_host_port
    - image links also need to be tweaked the same way
  - run web app in NODE_ENV=production (developers can ssh to change it)
  - configure storage (default is /tmp/ which might not have enough disk space)
    - hardcoded paths in fineuploaderlocalmiddleware and src/util.js need to be taken from configs

- databases need to be loaded (at least HMDB)
  - ideally the ansible script would take a list of dicts with csv locations, names and versions
  - molecular images should be generated with OpenBabel on insertion

- pandas 0.19.2 is necessary
  https://github.com/pandas-dev/pandas/issues/16519
