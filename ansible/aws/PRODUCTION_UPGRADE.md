# Review changes since the last deployment 

https://github.com/metaspace2020/metaspace/compare/release...master

Review all outstanding changes. If you're unfamiliar with any changes, 
ask the author if there are any manual steps needed. In addition  

### Main places to check for changes:

#### `metaspace/engine/sm/engine/es_export.py`

If new fields are added to ElasticSearch:
* It will be necessary to manually update the ElasticSearch index during deployment
* Ensure that sm-graphql has fallback logic for when the new fields aren't yet populated. 
    Note that if graphql returns `null`/`undefined` for a non-nullable field, the whole query will fail. 
    This can easily break the Datasets or Annotations pages.
    
    Also note that this behavior may be hidden during local development - the `graphqlMocks` feature flag
    replaces `undefined` return values with random test data.

If any of the existing field mappings (defined in `ESIndexManager.create_index`) are changed, 
it will be necessary to do a full rebuild of ElasticSearch. Try to avoid this, as it costs a lot of time.

#### `metaspace/graphql/src/migrations/`

Usually these are run automatically when the sm-graphql service restarts. Just be aware when they exist. 
They don't always succeed, and they occasionally need to be monkey-patched to fix a deployment. 

#### `metaspace/engine/migrations/`

These migations have to be run manually. Check with the author how to run them.

#### Config file and Ansible deployment script changes

It's always hard to know if these changes will deploy safely. Review them before deploying so you know
where to start looking if something goes wrong.

#### Test status in the `master` branch

Make sure `webapp` and `graphql` builds are passing in the `master` branch in CircleCI. 
It's possible for PRs that pass all tests to break the build after merging, 
e.g. if a function the PR depends on is renamed after the PR branches from master.  

# Choose a deployment strategy

Select one of the following based on whether the new code is compatible with the existing data. 
We should not have more than 1 minute of downtime without at least a visible message.  

#### In-place deployment

If there are no significant changes to ElasticSearch or Postgres:

1. Run [the Ansible web deployment](README.md).

#### Deployment followed by ElasticSearch update

If there are new fields in ElasticSearch, but it's ok for them to be populated over the course of several days:

1. Run [the Ansible web deployment](README.md).
2. Run an [ElasticSearch incremental update](#es-update).

#### ElasticSearch reindex before deployment

If there are new fields in ElasticSearch that are necessary for the new code:

1. Check out the new code into a temp directory on the server.
2. Create an inactive ElasticSearch index.
3. Use the new code to reindex into the inactive index. This can take multiple days.
4. Turn off dataset processing in https://metaspace2020.eu/admin/health 
5. Run a partial ElasticSearch update in the inactive index for any datasets that were created while indexing. 
    This is just to prevent users from wondering "Where is my data?" for recently submitted datasets.
5. Swap the inactive index with the active index.
6. Deploy the new code. 
7. Turn dataset reprocessing back on
8. Run a full incremental update just in case an old dataset was updated and its changes weren't
    propagated to the new ElasticSearch index.
9. Delete the old index (now the inactive index)  

#### Fork the VM, update, then swap to the new VM

If there are DB or infrastructure changes that require substantial downtime.

1. Turn METASPACE to full read-only mode on https://metaspace2020.eu/admin/health 
2. Use AWS to snapshot the VM, then create a new VM from the snapshot.
3. Update your Ansible `/env/prod/hosts` file to link to the IP address of the new VM.
4. Deploy to the new VM and apply the migrations.
5. Swap the Elastic IP address for metaspace2020.eu to the new VM's IP address.
6. Confirm everything is working and that the IP address change has propagated to your local computer, then turn off read-only mode.
7. Leave the old VM running (in read-only mode) for ~1 hour to account for slow DNS propagation 

# ElasticSearch Commands

Prerequisite environment setup:
```bash
ssh ubuntu@metaspace2020.eu             # Connect to the server
cd /opt/dev/metaspace/metaspace/engine    
source activate sm                      # Activate the sm Python environment
# This will probably warn about "/usr/local/bin/deactivate". Ignore it.
```
## Managing the indexes

#### Check status of indexes

```bash
python -m scripts.manage_es_index status
```

#### Create inactive index

```bash
python -m scripts.manage_es_index --inactive create
```

#### Swap inactive and active indexes

```bash
python -m scripts.manage_es_index swap
```

#### Drop inactive index

Always use `status` to check that the index to drop is `inactive` before running this

```bash
python -m scripts.manage_es_index --inactive drop
```

## Reindexing

#### <a name="es-update"></a>Full in-place update

This will update the existing documents in-place.

```bash
nice python -m scripts.update_es_index --ds-name "%' ORDER BY id DESC; --"
# (Yes, this uses SQL injection... It's just easier to work with SQL than making 10s of command line options) 
```

#### <a name="es-recent"></a>Partial in-place update for recent datasets

Change the date in the query to the desired earliest date to update.

```bash
nice python -m scripts.update_es_index --ds-name "%' AND id > '2020-05-18'; --"
```

#### <a name="es-reindex"></a>Offline reindex

Run each line individually & check the results. 

```bash
# Check existing indexes
python -m scripts.manage_es_index status

# If there's an inactive index, drop it
python -m scripts.manage_es_index --inactive drop

# Create inactive index
python -m scripts.manage_es_index --inactive create

# Populate inactive index
nice python -m scripts.update_es_index --inactive --ds-name "%' ORDER BY id DESC; --"
# Disable dataset processing once this is done
 
# Add datasets that were created after the reindexing started
nice python -m scripts.update_es_index --inactive --ds-name "%' AND id > '2020-05-18'; --"

# Swap inactive and active indexes
python -m scripts.manage_es_index swap

# Deploy new code & check that it's working
# Re-enable dataset processing

# Do a full incremental index update, in case any datasets were missed 
nice python -m scripts.update_es_index --ds-name "%' ORDER BY id DESC; --"

# Once you're satisfied it's safe, drop the old index
python -m scripts.manage_es_index --inactive drop
```

# Post-deployment checks

* Check that https://metaspace2020.eu/datasets and https://metaspace2020.eu/annotations work and show data.

* If there have been any changes to the annotation code or cluster configuration, 
submit a [test dataset](metaspace/engine/tests/data/untreated) to check that annotation still works correctly.

# Troubleshooting

## Manage services with Supervisor

```bash
supervisorctl status
```
> ```
> sm-api                           RUNNING   pid 23950, uptime 26 days, 23:39:14
> sm-cluster-autostart             RUNNING   pid 26146, uptime 26 days, 2:21:22
> sm-graphql                       RUNNING   pid 20267, uptime 6 days, 0:48:08
> sm-update-daemon                 RUNNING   pid 23947, uptime 26 days, 23:39:14
> ```

If any service isn't `RUNNING`, first try restarting it, e.g. for sm-graphql:
```bash
supervisorctl restart sm-graphql
```

Check the logs if it won't stay running:
```bash
supervisorctl tail -10000 sm-graphql
```

Alternatively you can use `less` to browse the logs on the filesystem:

```bash
less /opt/dev/metaspace/metaspace/graphql/logs/sm-graphql.log
less /opt/dev/metaspace/metaspace/engine/logs/sm-api.log
less /opt/dev/metaspace/metaspace/engine/logs/sm-update-daemon.log
```

## Postgres

If you need to make manual database fixes, either use a dedicated database client (e.g. DataGrip), or the command line.
It's really easy to destroy data this way, so don't do this unless you've made an AWS snapshot of the VM, 
or you're confident in your SQL skills.

You can start an SQL prompt with `sudo -u postgres psql sm postgres`

## System services

Check statuses & recent logs:
```bash 
sudo systemctl status
sudo systemctl status nginx
sudo systemctl status postgres
sudo systemctl status elasticsearch
```

Reload nginx config:
```bash
sudo nginx -s reload
```

Restart services:
```bash
sudo systemctl restart nginx
sudo systemctl restart postgres
sudo systemctl restart elasticsearch
```

#### Logs

Most logs are in `/var/log` but are in protected directories. 
You may wish to `sudo su` so that you can more easily browse the filesystem. Don't forget to `exit` superuser mode
once you're done. 

```bash
sudo tail /var/log/nginx/error.log
sudo tail /var/log/elasticsearch/elasticsearch.log
sudo tail /var/log/postgresql/postgresql-9.5-main.log
```