# Environment setup

## IBM Cloud

Note that all resources should be created in the same region for best performance, 
but not all regions support all necessary services (COS, Functions, Gen2 VPC). 
METASPACE team members can use `eu-de`/Frankfurt for all services. 

1. Get someone to invite you to the organization, set up your IBMid & login
2. Ensure the organization's account is selected in the menu bar (the drop-down next to "Manage").
3. [Create an IAM API Key](https://cloud.ibm.com/iam/apikeys)
    * **Name:** `dev-<your initials>`
    * Copy this key into `lithops.ibm.iam_api_key` in the sm-engine `config.json`
4. [Create a resource group](https://cloud.ibm.com/account/resource-groups)
    * **Name:** `dev-<your initials>`
5. [Create an Object Storage Service](https://cloud.ibm.com/objectstorage/create)
    * **Plan:** Standard
    * **Resource group:** `dev-<your initials>`
6. Create buckets in the service you just created. Use "Customize your bucket", not one of the predefined buckets:
    * A persistent storage bucket for data like imzml files and the centroids cache
        * **Name:** `metaspace-<your initials>-data`:
        * This will be used for normal persistent data such as imzml files, moldb files and the centroids cache
        * **Resiliency:** Regional
        * **Storage class:** Smart Tier
    * A temp bucket for Lithops and other temp data  
        * It's easy to accidentally generate huge amounts of data with Lithops, so this includes a rule to automatically delete objects after 1 day:
        * **Name:** `metaspace-<your initials>-temp`:
        * **Resiliency:** Regional
        * **Storage class:** Standard
        * Create an **Expiration** rule:
            * **Rule name:** Cleanup
            * **Prefix filter:** (leave empty)
            * **Expiration days:** 1
            * Click **Save** above the rule
    * Copy the above bucket names into your sm-engine config.json
        * Set `lithops.lithops.storage_bucket` to the **temp** bucket name
        * In `lithops.sm_storage`, each entry has the pattern `"data type": ["bucket", "prefix"]`. 
            * Set `"pipeline_cache"`'s bucket to the **temp** bucket name
            * Set all other data types' buckets to the **data** bucket name
7. Create Cloud Object Storage service credentials
    * **Role:** Writer
    * **Advanced Options -> Include HMAC Credential:** On
    * (HMAC credentials are slightly faster & more reliable with Lithops as they don't have a token that needs to be 
    continually refreshed)
    * Open the credential details after they're created (click the arrow to the left of the row)
    * Copy the HMAC access key and secret key into the `lithops.ibm_cos` section of your sm-engine `config.json`  
8. Create a [Cloud Functions namespace](https://cloud.ibm.com/functions/) (from the "Current Namespace" menu at the top)
    * **Name:** `dev-<your initials>`
    * **Resource group:** `dev-<your initials>`
    * Once created, open "Namespace settings" and copy the Name and GUID to `lithops.ibm_cf` in the sm-engine `config.json`
9. (Optional) [Set up a VPC](https://cloud.ibm.com/vpc-ext/provision/vs)
    * VPC instances aren't used much in development, so it may be best to just skip this step and share the existing instance. 
    * **Operating system:** Ubuntu
    * **Profile:** Balanced 128GB RAM
    * **SSH Key:** Upload your own SSH public key
    * After creation, go into the instance details and add a Floating IP address
10. Configure your connection to the VPC
    * (If step 8 was skipped) Ask someone to append your SSH public key to:
        * `/root/.ssh/authorized_keys`
        * `/home/ubuntu/.ssh/authorized_keys`
    * Start the instance manually through the web UI
    * SSH into the instance to confirm it's set up correctly: `ssh ubuntu@<public IP address>`
    * Stop the instance through the web UI
    * Open the instance details and copy the ID and Floating IP into `lithops.ibm_vpc` in the sm-engine `config.json`
11. Update the Lithops to from localhost to IBM Cloud
    * Change `lithops.storage` from `localhost` to `ibm_cloud` in the sm-engine `config.json`
    * Change `lithops.mode` from `localhost` to `serverless`
    * Change `lithops.workers` from `4` to `1000`

## Setting up IBM Cloud CLI

1. Download it from https://cloud.ibm.com/docs/cli
2. Install plugins:
    ```
    ibmcloud plugin install cloud-functions
    ibmcloud plugin install cloud-object-storage
    ibmcloud plugin install vpc-infrastructure
    ```
3. Sign in with `ibmcloud login` and follow the prompts.
4. Use `ibmcloud target --cf` to select the organization / namespace that your functions are in.
5. Use `ibmcloud target -g dev-<your initials>` to select your resource group.
6. If you have already run some invocations, you can use `ibmcloud fn activation list` to list them to confirm that everything is configured correctly

## Debugging strategies

### Viewing Cloud Function logs via CLI

Note: Function logs are only retained by IBM for 24 hours, and logs are only made available once the Function has finished running.

Activation IDs can be found in the Lithops debug logs. 

* `ibmcloud fn activation list` lists recent Function calls
* `ibmcloud fn activation list <namespace>` lists recent Function calls in the specified namespace
* `ibmcloud fn activation logs <activation ID>` views the stdout logs of a specific function call
* `ibmcloud fn activation poll` monitors running jobs and prints each job's output when the job finishes

### Viewing VM logs

* Check if the VM is running with `ibmcloud is ins`. If not, run `ibmcloud is in-start <Instance ID>`
* SSH to the instance with `ssh ubuntu@<Instance Floating IP>`. If this doesn't succeed and the instance has had 
more than 60s to start, check that your SSH keys are accessible, i.e. `ssh-add -a` if you password-protected them. 
Also try `ssh -v ubuntu@<Instance Floating IP>` for verbose SSH logs.
* `cat /tmp/lithops/proxy.log` to see the logs for the "Proxy" (Lithops web server that handles incoming jobs)
* `ls /tmp/lithops/logs` to see individual log files for executed jobs

### Running pipeline stages locally

Adding `debug_run_locally=True` to an `executor.map`/`executor.call` will cause it to run the functions in the
calling process. This allows you to easily attach a debugger to the Python process.

Alternatively, the entire pipeline can be run locally by changing the `lithops.lithops.mode` and 
`lithops.lithops.storage_backend` to `localhost`, however this causes Lithops to use `multiprocessing` to run tasks
in parallel in separate processes, which is less useful for debugging.

It's easiest to debug a dataset if you first create it via the web UI. You can then reprocess it in the Python console
of your choice with the `ServerAnnotationJob` class, e.g.

```python
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import load_cobj, load_cobjs
from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.config import SMConfig
from sm.engine.utils.perf_profile import NullProfiler
from sm.engine.annotation_lithops.annotation_job import ServerAnnotationJob

config = SMConfig.get_conf(True)
ds_id = '2020-12-14_20h39m30s'
perf = NullProfiler()
executor = Executor(config['lithops'], perf)
# Note the use of "use_cache=True", which saves pipeline state to a persistent cache. This saves a lot of time if
# you ever need to restart the Python process, by allowing the pipeline to skip steps that have previously been run.
job = ServerAnnotationJob(executor, Dataset.load(DB(), ds_id), perf, use_cache=True)
job.run()
```

You can then view the internal state or rerun sections of the job with `job.pipe`, e.g.

```python
db_datas = load_cobjs(job.storage, job.pipe.db_data_cobjs)
# Note the use of `use_cache=False` to force the step to be re-run even if it was cached.
job.pipe.prepare_moldb(use_cache=False)
```


### Viewing Object Storage data locally

For temporary CloudObjects, the hard part is usually finding where the object is stored - you may have to log its 
location and manually retrieve it from the logs. It may also be necessary to disable `data_cleaner` in the 
Lithops config, so that temporary CloudObjects aren't deleted when the FunctionExecutor is GC'd.

If this becomes a frequent enough problem, it may be worth spending some time to save pickled copies of the `Pipeline`
object after each annotation.

Once you have the bucket & key for the object:

```python
from lithops.storage import Storage
from sm.engine.annotation_lithops.io import deserialize
from sm.engine.config import SMConfig

storage = Storage(lithops_config=SMConfig.get_conf()['lithops'])
obj = deserialize(storage.get_object('bucket', 'key'))
```   

Alternatively, you can use the IBM Cloud CLI to download objects to the local filesystem:

```
ibmcloud cos objects --bucket BUCKET
ibmcloud cos object-get --bucket BUCKET --key KEY DEST_FILENAME
```
