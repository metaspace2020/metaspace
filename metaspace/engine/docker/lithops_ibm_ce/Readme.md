## How to deploy new image

1. Activate python env and install latest version of the packages:
   ```
   $ cd metaspace/metaspace/engine
   $ source venv/bin/activate
   $ pip install -r requirement.txt
   ```
2. Login and activate CE project:
   ```
   $ ibmcloud login --sso
   $ ibmcloud target -g metaspace-env-prod && ibmcloud ce project select --name metaspace-prod-ce --kubecfg
   ```
3. Build and deploy image:
   ```
   $ ./build_and_push.sh 2.7.0
   ```
