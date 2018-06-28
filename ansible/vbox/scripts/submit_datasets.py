# This script is intended to be run after scripts/select_test_datasets.py
#
# Since sm-engine-ansible/vbox is mounted as /vagrant inside the VM,
# input paths are modified to account for that and then submitted with metadata
# to the GraphQL server running inside the machine (assuming port 13010 on the host).

from pathlib import Path
import json
import jwt  # pip install PyJWT
import requests

token = jwt.encode({'role': 'admin', 'iss': 'METASPACE2020', 'email': 'fake@email.com'}, 'secret').decode('utf8')
graphqlUrl = "http://localhost:13010/graphql"

for p in Path.glob(Path.cwd(), '**/**/meta.json'):
    ds_id = p.parts[-3]
    metadata = json.loads(open(str(p)).read())
    path = Path('/vagrant').joinpath(*p.parts[-3:-1])
    print(ds_id, path)
    query = """mutation M($jwt: String!, $path: String!, $dsId: String!, $meta: String!) {
                 submitDataset(jwt: $jwt, datasetId: $dsId, path: $path, metadataJson: $meta)
               }"""
    metadata['metaspace_options']['Metabolite_Database'] = ['HMDB'] # by default only HMDB is installed
    variables = dict(jwt=token, path=str(path), dsId=ds_id, meta=json.dumps(metadata))
    msg = dict(query=query, variables=variables, operationName="M")
    res = requests.post(graphqlUrl, json=msg)
    print(res.text)
