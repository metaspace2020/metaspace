import json
import math
import os
import pprint
import re
import urllib.parse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from getpass import getpass
from io import BytesIO
from pathlib import Path
from shutil import copyfileobj
from threading import BoundedSemaphore
from typing import Optional, List, Iterable, Union, Tuple, Dict, Any, TYPE_CHECKING
from urllib.parse import urlparse

import numpy as np
import pandas as pd
import requests
from PIL import Image
from tqdm import tqdm

from metaspace.image_processing import clip_hotspots
from metaspace.types import (
    Metadata,
    DSConfig,
    make_metadata,
    Polarity,
    DatasetDownloadFile,
    DatasetDownload,
    DatasetUser,
    DatasetGroup,
    DatasetProject,
    DatasetDiagnostic,
)

try:
    from typing import TypedDict, Literal  # Requires Python 3.8

    _TIC_Literal = Literal['TIC']
except ImportError:
    TypedDict = dict
    _TIC_Literal = str

try:
    from pandas import json_normalize  # Only in Pandas 1.0.0+
except ImportError:
    from pandas.io.json import json_normalize  # Logs DeprecationWarning if used in Pandas 1.0.0+

if TYPE_CHECKING:
    # Cannot import directly due to circular imports
    from metaspace.projects_client import ProjectsClient

DEFAULT_DATABASE = ('HMDB', 'v4')


class MetaspaceException(Exception):
    pass


class GraphQLException(MetaspaceException):
    def __init__(self, json, message, type=None):
        super().__init__(f"{type}: {message}" if type is not None else message)
        self.json = json
        self.message = message
        self.type = type


class BadRequestException(MetaspaceException):
    def __init__(self, json, message, type=None):
        super().__init__(f"{type}: {message}")
        self.json = json
        self.message = message
        self.type = type


class InvalidResponseException(MetaspaceException):
    def __init__(self, json, http_response):
        super().__init__('Invalid response from server')
        self.json = json
        self.http_response = http_response


def _extract_data(res):
    if not res.headers.get('Content-Type').startswith('application/json'):
        raise Exception(
            'Wrong Content-Type: {}.\n{}'.format(res.headers.get('Content-Type'), res.text)
        )

    res_json = res.json()
    if 'data' in res_json and 'errors' not in res_json:
        return res_json['data']
    else:
        if 'errors' in res_json:
            try:
                # Some operations raise user-correctable errors with JSON messages that have a
                # user-friendly 'message' field and a 'type' field for programmatic recognition.
                json_error = json.loads(res_json['errors'][0]['message'])
            except json.JSONDecodeError:
                json_error = None

            if json_error is not None and 'type' in json_error and 'message' in json_error:
                raise GraphQLException(res_json, json_error['message'], json_error['type'])

            pprint.pprint(res_json['errors'])
            raise GraphQLException(res_json, res_json['errors'][0]['message'])
        elif 'message' in res_json:
            raise BadRequestException(res_json, res_json['message'], res_json.get('type'))
        else:
            pprint.pprint(res_json)
            raise InvalidResponseException(res_json, res)


def get_config(
    host=None, verify_certificate=True, email=None, password=None, api_key=None, config_path=None
):
    default_config_path = Path.home() / '.metaspace'
    try:
        from configparser import ConfigParser

        if config_path:
            config_file = Path(config_path).read_text()
        else:
            config_file = default_config_path.read_text()

        config_parser = ConfigParser()
        config_parser.read_string('[metaspace]\n' + config_file)
        config = config_parser['metaspace']

        if not host:
            host = config.get('host')
        if not email and not api_key:
            email = config.get('email')
            password = config.get('password')
            api_key = config.get('api_key')
    except Exception as ex:
        if config_path:
            raise
        if default_config_path.exists():
            print('Error processing ~/.metaspace config file')
            raise

    host = host or 'https://metaspace2020.org'
    return {
        'host': host,
        'graphql_url': '{}/graphql'.format(host),
        'moldb_url': '{}/mol_db/v1'.format(host),
        'signin_url': '{}/api_auth/signin'.format(host),
        'gettoken_url': '{}/api_auth/gettoken'.format(host),
        'raw_opt_upload_url': f'{host}/raw_opt_upload',
        'database_upload_url': f'{host}/database_upload',
        'dataset_upload_url': f'{host}/dataset_upload',
        'usr_email': email,
        'usr_pass': password,
        'usr_api_key': api_key,
        'verify_certificate': verify_certificate,
    }


def multipart_upload(
    local_path,
    companion_url,
    file_type,
    headers={},
    current_user_id=None,
    dataset_id=None,
):
    def send_request(
        url,
        method='GET',
        json=None,
        data=None,
        headers=None,
        return_headers=False,
        max_retries=0,
    ):
        for i in range(max_retries + 1):
            try:
                resp = session.request(method, url, data=data, json=json, headers=headers)
                resp.raise_for_status()
                return resp.json() if not return_headers else resp.headers
            except requests.RequestException as ex:
                if i == max_retries:
                    raise
                print(f'{ex}\nRetrying...')

    def init_multipart_upload(
        filename, file_type, headers={}, current_user_id=None, dataset_id=None, size=None
    ):
        url = companion_url + '/s3/multipart'
        data = {
            'filename': filename,
            'type': file_type,
            'metadata': {
                'name': filename,
                'type': file_type,
                'source': 'api',
                'size': str(size) if size else 'not-provided',
                'user': current_user_id if current_user_id else 'not-provided',
                'datasetId': dataset_id if dataset_id else 'not-provided',
                'uuid': headers['uuid'] if headers.get('uuid') else 'not-provided',
            },
        }
        resp_data = send_request(url, 'POST', json=data, headers=headers)
        return resp_data['key'], resp_data['uploadId']

    def sign_part_upload(key, upload_id, part):
        query = urllib.parse.urlencode({'key': key})
        url = f'{companion_url}/s3/multipart/{upload_id}/{part}?{query}'
        resp_data = send_request(url, max_retries=2)
        return resp_data['url']

    def upload_part(part, data):
        try:
            max_retries = 3
            for i in range(max_retries):
                try:
                    presigned_url = sign_part_upload(key, upload_id, part)
                    resp_data = send_request(
                        presigned_url,
                        'PUT',
                        data=data,
                        headers=headers,
                        return_headers=True,
                        max_retries=2,
                    )
                    return resp_data['ETag']
                except Exception as ex:
                    if i == max_retries - 1:
                        raise
                    else:
                        print(f'Part {part} failed with error: {ex}. Retrying...')
        finally:
            semaphore.release()

    def complete_multipart_upload(key, upload_id, etags, headers={}):
        query = urllib.parse.urlencode({'key': key})
        url = f'{companion_url}/s3/multipart/{upload_id}/complete?{query}'
        data = {'parts': [{'PartNumber': part, 'ETag': etag} for part, etag in etags]}
        resp_data = send_request(url, 'POST', json=data, headers=headers, max_retries=2)
        # Decode bucket from returned URL
        location = urllib.parse.unquote(resp_data['location'])
        dest_url = urllib.parse.urlparse(location)
        if '.' in dest_url.hostname:
            # S3 URL e.g. https://sm-engine-upload.s3.eu-west-1.amazonaws.com/
            bucket = dest_url.hostname.split('.')[0]
        else:
            # Minio URL e.g. http://storage:9000/sm-engine-dev/
            bucket = dest_url.path[1:].split('/')[0]
        return bucket

    def iterate_file(key, upload_id, local_path):
        part = 0
        with open(local_path, 'rb') as f:
            f.seek(0, 2)
            file_len_mb = f.tell() / 1024 ** 2
            f.seek(0)
            # S3 supports max 10000 parts per file. Increase part size if needed
            part_size_mb = max(5, int(math.ceil(file_len_mb / 10000)))
            n_parts = int(math.ceil(file_len_mb / part_size_mb))
            while True:
                semaphore.acquire()
                file_data = f.read(part_size_mb * 1024 ** 2)
                if not file_data:
                    break

                part += 1
                print(f'Uploading part {part:3}/{n_parts:3} of {Path(local_path).name} file...')
                yield part, file_data

    session = requests.Session()
    key, upload_id = init_multipart_upload(
        Path(local_path).name,
        file_type,
        size=Path(local_path).stat().st_size,
        headers=headers,
        current_user_id=current_user_id,
        dataset_id=dataset_id,
    )

    # Python evaluates the input to ThreadPoolExecutor.map eagerly, which would allow iterate_file
    # to read parts and sign uploads even if there was a significant queue to upload_part.
    # This semaphore ensures that iterate_file can only read, sign and yield a part when upload_part
    # is ready to receive it.
    n_threads = 8
    semaphore = BoundedSemaphore(n_threads)

    with ThreadPoolExecutor(n_threads) as ex:
        etags = list(
            ex.map(
                lambda args: (args[0], upload_part(*args)),
                iterate_file(key, upload_id, local_path),
            )
        )

    bucket = complete_multipart_upload(key, upload_id, etags)
    return bucket, key


def _dataset_upload(imzml_fn, ibd_fn, companion_url, current_user_id=None):
    assert Path(imzml_fn).exists(), f'Could not find .imzML file: {imzml_fn}'
    assert Path(ibd_fn).exists(), f'Could not find .ibd file: {ibd_fn}'
    # Get UUID for upload
    url = f'{companion_url}/s3/uuid'
    resp = requests.get(url)
    resp.raise_for_status()
    headers = resp.json()

    for fn in [imzml_fn, ibd_fn]:
        bucket, key = multipart_upload(
            fn,
            companion_url,
            'application/octet-stream',
            headers=headers,
            current_user_id=current_user_id,
        )
    input_path = f's3a://{bucket}/{key.rsplit("/", 1)[0]}'
    return input_path


def _str_to_tiptap_markup(text):
    """Convert a plain text string into a TipTap-compatible markup structure"""
    return json.dumps(
        {
            'type': 'doc',
            'content': [
                {'type': 'paragraph', 'content': [{'type': 'text', 'text': paragraph}]}
                for paragraph in text.split('\n\n')
            ],
        }
    )


class GraphQLClient(object):
    """Client for low-level access to the METASPACE API, for advanced operations that aren't
    supported by :py:class:`metaspace.sm_annotation_utils.SMInstance`.

    Use :py:attr:`query` for calling GraphQL directly.
    An editor for composing GraphQL API queries can be found at https://metaspace2020.org/graphql
    """

    def __init__(self, config):
        self._config = config
        self.host = self._config['host']
        self.session = requests.Session()
        self.session.verify = self._config['verify_certificate']
        self.logged_in = False

        if self._config.get('usr_api_key'):
            try:
                self.logged_in = self.query('query { currentUser { id } }') is not None
            except BadRequestException as ex:
                if 'Invalid API key' in ex.message or 'Login failed' in ex.message:
                    print('Login failed. Only public datasets will be accessible.')
                    self.logged_in = False
                else:
                    raise
            except requests.exceptions.ConnectionError:
                print('No network connection.')
        elif self._config['usr_email']:
            try:
                login_res = self.session.post(
                    self._config['signin_url'],
                    params={
                        'email': self._config['usr_email'],
                        'password': self._config['usr_pass'],
                    },
                )
            except requests.exceptions.ConnectionError:
                self.logged_in = False
                print('No network connection.')
            else:
                if login_res.status_code == 401:
                    print('Login failed. Only public datasets will be accessible.')
                elif login_res.status_code:
                    self.logged_in = True
                else:
                    login_res.raise_for_status()

    def query(self, query, variables={}):
        api_key = self._config.get('usr_api_key')
        headers = {
            'Authorization': f'Api-Key {api_key}' if api_key else 'Bearer ' + self.get_jwt(),
            'Source': 'api',
        }

        res = self.session.post(
            self._config['graphql_url'],
            json={'query': query, 'variables': variables},
            headers=headers,
            verify=self._config['verify_certificate'],
        )
        return _extract_data(res)

    def get_jwt(self):
        res = self.session.get(
            self._config['gettoken_url'], verify=self._config['verify_certificate']
        )
        res.raise_for_status()
        return res.text

    def get_primary_group_id(self):
        query = """
            query {
              currentUser {
                primaryGroup { group { id } }
              }
            }
        """
        primary_group = self.query(query)['currentUser']['primaryGroup']
        return primary_group.get('group', {}).get('id', None) if primary_group else None

    def iterQuery(self, query, variables={}, batch_size=50000):
        """
        Assumes query has $offset and $limit parameters,
        and yields query results with these set to (k*batch_size, batch_size)
        """
        # FIXME: use scroll api?
        assert batch_size >= 100, "too small batch size, must be at least 100"
        offset = 0
        v = deepcopy(variables)
        while True:
            v['limit'] = batch_size
            v['offset'] = offset
            yield self.query(query, v)
            offset += batch_size

    def listQuery(self, field_name, query, variables={}, batch_size=50000, limit=None):
        """
        Gets all results of an iterQuery as a list.
        Field name must be provided in addition to the query (e.g. 'allDatasets')
        """
        if limit is not None:
            batch_size = min(batch_size, limit)
        records = []
        for res in self.iterQuery(query, variables, batch_size):
            if not res[field_name] or limit is not None and len(records) >= limit:
                break
            records.extend(res[field_name])
        return records

    DATASET_FIELDS = """
        id
        name
        uploadDT
        submitter {
          id
          name
        }
        group {
          id
          name
          shortName
        }
        principalInvestigator {
          name
        }
        projects {
          id
          name
          publicationStatus
        }
        polarity
        ionisationSource
        analyzer {
          type
          resolvingPower(mz: 400)
        }
        organism
        organismPart
        condition
        growthConditions
        maldiMatrix
        configJson
        metadataJson
        isPublic
        databases { id name version isPublic archived }
        adducts
        acquisitionGeometry
        metadataType
        status
        inputPath
    """

    ANNOTATION_FIELDS = """
        sumFormula
        neutralLoss
        chemMod
        adduct
        ionFormula
        ion
        mz
        msmScore
        rhoSpatial
        rhoSpectral
        rhoChaos
        fdrLevel
        offSample
        offSampleProb
        dataset { id name }
        possibleCompounds { name information { url databaseId } }
        isotopeImages { mz url minIntensity maxIntensity totalIntensity }
    """

    MOLECULAR_DB_FIELDS = "id name version isPublic archived default"

    SCORING_MODEL_FIELDS = "id name version type isArchived"

    def getDataset(self, datasetId):
        query = f"""
            query datasetInfo($id: String!) {{
              dataset(id: $id) {{
                {self.DATASET_FIELDS}
              }}
            }}
        """
        match = self.query(query, {'id': datasetId})['dataset']
        if not match:
            if self.logged_in:
                raise DatasetNotFound("No dataset found with id {}.".format(datasetId))
            else:
                raise DatasetNotFound(
                    "No dataset found with id {}. You are not logged in. "
                    "If the dataset is set to private, you need to log in to access it.".format(
                        datasetId
                    )
                )
        else:
            return match

    def getDatasetByName(self, datasetName):
        query = f"""
            query datasetInfo($filter: DatasetFilter!) {{
              allDatasets(filter: $filter) {{
                {self.DATASET_FIELDS}
              }}
            }}
        """
        matches = self.query(query, {'filter': {'name': datasetName}})['allDatasets']
        if not matches:
            if self.logged_in:
                raise DatasetNotFound("No dataset found with name '{}'.".format(datasetName))
            else:
                raise DatasetNotFound(
                    "No dataset found with name '{}'. You are not logged in. "
                    "If the dataset is set to private, you need to log in to access it.".format(
                        datasetName
                    )
                )
        elif len(matches) > 1:
            print('Found datasets:')
            for dataset in matches:
                print(dataset['name'], 'id={}'.format(dataset['id']), '\n')
            raise Exception(
                'More than 1 dataset were found with the same name, '
                'please run your code with the dataset ID instead.'
            )
        else:
            return matches[0]

    def getAnnotations(
        self, annotationFilter=None, datasetFilter=None, colocFilter=None, limit=None
    ):
        query_arguments = [
            "$filter: AnnotationFilter",
            "$dFilter: DatasetFilter",
            "$orderBy: AnnotationOrderBy",
            "$sortingOrder: SortingOrder",
            "$offset: Int",
            "$limit: Int",
            "$colocalizationCoeffFilter: ColocalizationCoeffFilter",
        ]
        query = f"""
            query getAnnotations({','.join(query_arguments)}) {{
              allAnnotations(
                filter: $filter,
                datasetFilter: $dFilter,
                orderBy: $orderBy,
                sortingOrder: $sortingOrder,
                offset: $offset,
                limit: $limit,
              ) {{
                {self.ANNOTATION_FIELDS}
                colocalizationCoeff(colocalizationCoeffFilter: $colocalizationCoeffFilter)
              }}
            }}
        """
        annot_filter = annotationFilter

        if colocFilter:
            annot_filter = deepcopy(annot_filter) if annot_filter else {}
            annot_filter.update(colocFilter)
            order_by = 'ORDER_BY_COLOCALIZATION'
        else:
            order_by = 'ORDER_BY_MSM'

        vars = {
            'filter': annot_filter,
            'dFilter': datasetFilter,
            'colocalizationCoeffFilter': colocFilter,
            'orderBy': order_by,
        }
        return self.listQuery(field_name='allAnnotations', query=query, variables=vars, limit=limit)

    def countAnnotations(self, annotationFilter=None, datasetFilter=None):
        query = """
            query getAnnotationCount($filter: AnnotationFilter,
                                 $dFilter: DatasetFilter) {
              countAnnotations(
                filter: $filter,
                datasetFilter: $dFilter
              )
            }"""

        return self.query(
            query=query, variables={'filter': annotationFilter, 'dFilter': datasetFilter}
        )

    def getDatasets(self, datasetFilter=None):
        query = f"""
            query getDatasets($filter: DatasetFilter,
                              $offset: Int, $limit: Int) {{
              allDatasets(
                filter: $filter,
                offset: $offset,
                limit: $limit
              ) {{
                {self.DATASET_FIELDS}
              }}
            }}
        """
        return self.listQuery('allDatasets', query, {'filter': datasetFilter})

    def getRawOpticalImage(self, dsid):
        query = """
            query getRawOpticalImages($datasetId: String!){
                rawOpticalImage(datasetId: $datasetId)
                {
                    url, transform
                }
            }
        """
        variables = {"datasetId": dsid}
        return self.query(query, variables)

    def getRegisteredImage(self, dsid, zoom_level=8):
        query = """
            query getRawOpticalImages($datasetId: String!, $zoom: Int){
                rawOpticalImage(datasetId: $datasetId)
            }
        """
        variables = {"datasetId": dsid}
        return self.query(query, variables)

    def get_visible_databases(self):
        query = f"query allMolecularDBs {{ allMolecularDBs {{ {self.MOLECULAR_DB_FIELDS} }} }}"
        result = self.query(query)
        return result['allMolecularDBs']

    def get_visible_scoring_models(self):
        query = f"query scoringModels {{ scoringModels {{ {self.SCORING_MODEL_FIELDS} }} }}"
        result = self.query(query)
        return result['scoringModels']

    @staticmethod
    def map_database_name_to_name_version(name: str) -> Tuple[str, str]:
        # For backwards compatibility map old database names to (name, version) tuples
        database_name_version_map = {
            'ChEBI': ('ChEBI', '2016'),
            'LIPID_MAPS': ('LIPID_MAPS', '2016'),
            'SwissLipids': ('SwissLipids', '2016'),
            'HMDB-v2.5': ('HMDB', 'v2.5'),
            'HMDB-v2.5-cotton': ('HMDB-cotton', 'v2.5'),
            'BraChemDB-2018-01': ('BraChemDB', '2018-01'),
            'ChEBI-2018-01': ('ChEBI', '2018-01'),
            'HMDB-v4': ('HMDB', 'v4'),
            'HMDB-v4-endogenous': ('HMDB-endogenous', 'v4'),
            'LipidMaps-2017-12-12': ('LipidMaps', '2017-12-12'),
            'PAMDB-v1.0': ('PAMDB', 'v1.0'),
            'SwissLipids-2018-02-02': ('SwissLipids', '2018-02-02'),
            'HMDB-v4-cotton': ('HMDB-cotton', 'v4'),
            'ECMDB-2018-12': ('ECMDB', '2018-12'),
        }
        return database_name_version_map.get(name, (None, None))

    @staticmethod
    def map_scoring_model_name_to_name_version(name: str) -> Tuple[str, str]:
        # For backwards compatibility map old database names to (name, version) tuples
        scoring_model_name_version_map = {
            'MSM': ('MSM', 'v1'),
            'Animal': ('Animal', 'v2.2023-12-14'),
            'Plant': ('Plant', 'v2.2023-12-14'),
            'v3_default': ('v3_default', 'v1'),
        }
        return scoring_model_name_version_map.get(name, (None, None))

    def map_database_to_id(self, database: Union[int, str, Tuple[str, str]]):
        # Forwards/backwards compatibility issue: the GraphQL Schema may soon change from Int ids
        # to ID (i.e. str-based) ids. For now, this supports both types, and passes the type on
        # without modification. When the API has settled, this should be updated to coerce to the
        # correct type, because we shouldn't burden users with having to figure out why calls are
        # failing when they pass IDs that look like integers as integers instead of strings.
        if isinstance(database, int):
            return database

        if isinstance(database, str) and re.match(r'^\d+$', database):
            return int(database)

        database_docs = self.get_visible_databases()
        database_name_id_map = defaultdict(list)
        for db in database_docs:
            database_name_id_map[(db['name'], db['version'])].append(db['id'])

        if isinstance(database, tuple):
            db_name, db_version = database
        else:
            db_name, db_version = self.map_database_name_to_name_version(database)

        database_ids = database_name_id_map.get((db_name, db_version), [])
        if len(database_ids) == 0:
            raise Exception(
                f'Database not found or you do not have access to it. Available databases: '
                f'{list(database_name_id_map.keys())}'
            )
        if len(database_ids) > 1:
            raise Exception(f'Database name "{database}" is not unique. Use database id instead.')

        return database_ids[0]

    def map_scoring_model_to_id(self, scoring_model: Union[int, str, Tuple[str, str]]):
        if isinstance(scoring_model, int):
            return scoring_model

        if isinstance(scoring_model, str) and re.match(r'^\d+$', scoring_model):
            return int(scoring_model)

        scoring_model_docs = self.get_visible_scoring_models()
        scoring_model_name_id_map = defaultdict(list)
        for sm in scoring_model_docs:
            scoring_model_name_id_map[(sm['name'], sm['version'])].append(sm['id'])

        if isinstance(scoring_model, tuple):
            model_name, model_version = scoring_model
        else:
            model_name, model_version = self.map_scoring_model_name_to_name_version(scoring_model)

        scoring_model_ids = scoring_model_name_id_map.get((model_name, model_version), [])
        if len(scoring_model_ids) == 0:
            default_model = next(
                (obj for obj in scoring_model_docs if obj['type'] == 'original'), None
            )
            if default_model is not None:
                print(
                    f'Scoring model not found or you do not have access to it. Setting original MSM as default {default_model["id"]}'
                )
                return default_model['id']
            else:
                raise Exception(
                    f'Scoring model not found or you do not have access to it. Available databases: '
                    f'{list(scoring_model_name_id_map.keys())}'
                )
        if len(scoring_model_ids) > 1:
            raise Exception(
                f'Scoring model name "{scoring_model}" is not unique. Use scoring model id instead.'
            )

        return scoring_model_ids[0]

    def _get_dataset_upload_uuid(self):
        url = f'{self._config["dataset_upload_url"]}/s3/uuid'
        resp = requests.get(url)
        resp.raise_for_status()
        return resp.json()

    def create_dataset(self, input_params, perform_enrichment=False, ds_id=None):
        query = """
            mutation createDataset($id: String, $input: DatasetCreateInput!,
                $priority: Int, $useLithops: Boolean, $performEnrichment: Boolean) {
                createDataset(
                  id: $id,
                  input: $input,
                  priority: $priority,
                  useLithops: $useLithops,
                  performEnrichment: $performEnrichment,
                )
            }
        """
        variables = {
            'id': ds_id,
            'input': input_params,
            'priority': 0,
            'useLithops': True,
            'performEnrichment': perform_enrichment,
        }
        return self.query(query, variables)['createDataset']

    def delete_dataset(self, ds_id, force=False):
        query = """
                mutation customDeleteDataset ($dsId: String!, $force: Boolean) {
                      deleteDataset(
                        id: $dsId
                        force: $force
                      )
                 }
                """
        variables = {'dsId': ds_id}
        return self.query(query, variables)

    def update_dataset(
        self,
        ds_id,
        input={},
        reprocess=False,
        force=False,
        perform_enrichment=False,
        priority=1,
    ):
        query = """
            mutation updateDataset($id: String!, $input: DatasetUpdateInput!,
                $priority: Int, $reprocess: Boolean, $force: Boolean,
                $useLithops: Boolean, $performEnrichment: Boolean) {
                updateDataset(
                    id: $id,
                    input: $input,
                    priority: $priority,
                    reprocess: $reprocess,
                    force: $force,
                    useLithops: $useLithops,
                    performEnrichment: $performEnrichment,
                )
            }
        """

        variables = {
            'id': ds_id,
            'input': input,
            'priority': priority,
            'reprocess': reprocess,
            'force': force,
            'useLithops': True,
            'performEnrichment': perform_enrichment,
        }

        self.query(query, variables)

    def create_database(
        self,
        local_path: Union[str, Path],
        name: str,
        version: str,
        is_public: bool = False,
        groupId: str = None,
    ) -> dict:
        # TODO: s3 -> s3a in GraphQL
        result = self.query("""query { currentUser { id } }""")
        current_user_id = result['currentUser'] and result['currentUser']['id']

        bucket, key = multipart_upload(
            local_path,
            self._config['database_upload_url'],
            'text/csv',
            current_user_id=current_user_id,
        )
        s3_path = f's3://{bucket}/{key}'

        query = f"""
            mutation ($input: CreateMolecularDBInput!) {{
              createMolecularDB(databaseDetails: $input) {{
                id
              }}
            }}
        """
        variables = {
            "input": {
                "name": name,
                "version": version,
                "isPublic": is_public,
                "filePath": s3_path,
                "groupId": groupId if groupId else self.get_primary_group_id(),
            }
        }
        return self.query(query, variables)['createMolecularDB']

    def update_database(self, id: int, is_public: bool = None, archived: bool = None) -> dict:
        query = f"""
            mutation ($databaseId: Int!, $input: UpdateMolecularDBInput!) {{
              updateMolecularDB(databaseId: $databaseId, databaseDetails: $input) {{
                id
              }}
            }}
        """
        variables = {
            "databaseId": id,
            "input": {"isPublic": is_public, "archived": archived},
        }
        return self.query(query, variables)['updateMolecularDB']

    def delete_database(self, id: int) -> bool:
        query = f"""
            mutation ($databaseId: Int!) {{
              deleteMolecularDB(databaseId: $databaseId)
            }}
        """
        variables = {"databaseId": id}
        return self.query(query, variables)['deleteMolecularDB']

    def get_dataset_diagnostics(self, ds_id):
        results = self.query(
            f"""query getDatasetDiagnostics($datasetId: String!) {{
          dataset(id: $datasetId) {{ 
            diagnostics {{
              id type jobId data
              database {{ {self.MOLECULAR_DB_FIELDS} }}
              images {{ key index url format }}
            }}
          }}
        }}""",
            {'datasetId': ds_id},
        )

        return results['dataset'].get('diagnostics')


class IsotopeImages(object):
    def __init__(self, images, sf, chem_mod, neutral_loss, adduct, centroids, urls):
        self._images = images
        # Keeping the private self._sf, self._adduct fields for backwards compatibility. There is no other easy way
        # to get that data, so it's probable that there is code somewhere that depends on the private fields.
        self.formula = self._sf = sf
        self.chem_mod = chem_mod
        self.neutral_loss = neutral_loss
        self.adduct = self._adduct = adduct
        self._centroids = centroids
        self._urls = urls

    def __getitem__(self, index):
        return self._images[index]

    def __repr__(self):
        return f"IsotopeImages({self.formula}{self.chem_mod or ''}{self.neutral_loss or ''}{self.adduct})"

    def __len__(self):
        return len(self._images)

    def __bool__(self):
        return len(self._images) > 0

    def peak(self, index):
        return self._centroids[index]

    def plot(self, n_images=-1):
        import matplotlib.pyplot as plt

        if n_images > 0:
            n_images = min(n_images, len(self))
        else:
            n_images = len(self)
        for i in range(n_images):
            plt.subplot(1, len(self._images), i + 1)
            plt.title(round(self.peak(i), 4))
            plt.axis('off')
            plt.imshow(self._images[i], interpolation='none', cmap='viridis')


class OpticalImage(object):
    def __init__(self, image, registered_image):
        self._images = [image]
        self._transforms = [registered_image]
        self._itransforms = [np.linalg.inv(t) for t in self._transforms]

    def __getitem__(self, index):
        return self._images[index]

    def __len__(self):
        return len(self._images)

    def _tform_to_tuple(self, tform):
        return (tform[0, 0], tform[0, 1], tform[0, 2], tform[1, 0], tform[1, 1], tform[1, 2])

    def _to_rgb(self, image):
        return Image.fromarray(255 * image / image.max()).convert('RGB')

    def _transform(self, image, transform, target_image_shape):
        """
        :param image:
        :param transform:
        :return:
        """
        im_t = image.transform(
            target_image_shape,
            Image.AFFINE,
            self._tform_to_tuple(transform),
            resample=Image.NEAREST,
        )
        return im_t

    def to_ion_image(self, index, ion_image_shape):
        return self._transform(
            Image.fromarray(self[index]),
            self._transforms[index],
            (ion_image_shape[1], ion_image_shape[0]),
        )

    def ion_image_to_optical(self, ion_image, index=0):
        return self._transform(
            self._to_rgb(ion_image),
            self._itransforms[index],
            (self._images[index].shape[1], self._images[index].shape[0]),
        )


class SMDataset(object):
    def __init__(self, _info, gqclient):
        self._info = _info
        self._gqclient: GraphQLClient = gqclient
        self._config = json.loads(self._info['configJson'])
        self._metadata = make_metadata(self._info['metadataJson'])
        self._session = requests.session()
        self._databases = [MolecularDB(db) for db in self._info['databases']]
        self._diagnostics = None
        self._diagnostic_images = {}

    @property
    def id(self):
        return self._info['id']

    @property
    def name(self):
        return self._info['name']

    @property
    def s3dir(self):
        """The location of the uploaded imzML file. Not publicly accessible, but this can be used
        in the `input_path` parameter to `SMInstance.submit_dataset` to clone a dataset."""
        return self._info['inputPath']

    def __repr__(self):
        return "SMDataset({} | ID: {})".format(self.name, self.id)

    def annotations(
        self,
        fdr: float = 0.1,
        database: Union[int, str, Tuple[str, str]] = DEFAULT_DATABASE,
        return_vals: Iterable = ('sumFormula', 'adduct'),
        **annotation_filter,
    ) -> List[list]:
        """Fetch dataset annotations.

        Args:
            fdr: Max FDR level.
            database: Database name or id.
            return_vals: Tuple of fields to return.

        Returns:
            List of annotations with requested fields.
        """
        annotation_filter.setdefault('fdrLevel', fdr)
        if database:
            annotation_filter['databaseId'] = self._gqclient.map_database_to_id(database)
        dataset_filter = {'ids': self.id}

        records = self._gqclient.getAnnotations(annotation_filter, dataset_filter)
        return [list(r[val] for val in return_vals) for r in records]

    def results(
        self,
        database: Union[int, str, Tuple[str, str]] = DEFAULT_DATABASE,
        fdr: float = None,
        coloc_with: str = None,
        include_chem_mods: bool = False,
        include_neutral_losses: bool = False,
        **annotation_filter,
    ) -> pd.DataFrame:
        """Fetch all dataset annotations as dataframe.

        Args:
            database: Molecular database name or id.
            fdr: Max FDR level.
            coloc_with: Fetch only results colocalized with formula.
            include_chem_mods: Include results with chemical modifications.
            include_neutral_losses: Include results with neutral losses.

        Returns:
            List of annotations with requested fields.
        """

        def get_compound_database_ids(possibleCompounds):
            return [
                compound['information'] and compound['information'][0]['databaseId']
                for compound in possibleCompounds
            ]

        if coloc_with:
            assert fdr
            coloc_coeff_filter = {
                'colocalizedWith': coloc_with,
                'fdrLevel': fdr,
            }
            if database:
                coloc_coeff_filter['databaseId'] = self._gqclient.map_database_to_id(database)
            annotation_filter.update(coloc_coeff_filter)
        else:
            coloc_coeff_filter = None
            if database:
                annotation_filter['databaseId'] = self._gqclient.map_database_to_id(database)
            if fdr:
                annotation_filter['fdrLevel'] = fdr

        index_fields = ['formula', 'adduct']
        if include_chem_mods:
            index_fields.append('chemMod')
        else:
            annotation_filter['hasChemMod'] = False
        if include_neutral_losses:
            index_fields.append('neutralLoss')
        else:
            annotation_filter['hasNeutralLoss'] = False

        records = self._gqclient.getAnnotations(
            annotationFilter=annotation_filter,
            datasetFilter={'ids': self.id},
            colocFilter=coloc_coeff_filter,
        )
        if not records:
            return pd.DataFrame()

        df = json_normalize(records)
        return (
            df.assign(
                moleculeNames=df.possibleCompounds.apply(
                    lambda lst: [item['name'] for item in lst]
                ),
                moleculeIds=df.possibleCompounds.apply(get_compound_database_ids),
                min_intensity=df.isotopeImages.apply(lambda imgs: imgs[0]['minIntensity']),
                max_intensity=df.isotopeImages.apply(lambda imgs: imgs[0]['maxIntensity']),
                total_intensity=df.isotopeImages.apply(lambda imgs: imgs[0]['totalIntensity']),
            )
            .drop(
                columns=[
                    'possibleCompounds',
                    'dataset.id',
                    'dataset.name',
                    'offSampleProb',
                ]
            )
            .rename(
                columns={
                    'sumFormula': 'formula',
                    'msmScore': 'msm',
                    'rhoChaos': 'moc',
                    'fdrLevel': 'fdr',
                    'colocalizationCoeff': 'colocCoeff',
                }
            )
            .set_index(index_fields)
            # Don't include chemMod/neutralLoss columns if they have been excluded
            .drop(columns=['chemMod', 'neutralLoss'], errors='ignore')
        )

    @property
    def metadata(self) -> Metadata:
        return self._metadata

    @property
    def config(self) -> DSConfig:
        return self._config

    @property
    def adducts(self) -> List[str]:
        return self._config['isotope_generation']['adducts']

    @property
    def polarity(self) -> Polarity:
        if self._config['isotope_generation']['charge'] > 0:
            return 'Positive'
        return 'Negative'

    @property
    def database_details(self) -> List['MolecularDB']:
        """A list of all databases that have been used to annotate this dataset"""
        return self._databases

    @property
    def databases(self):
        """DEPRECATED. Use 'databases_details' instead.

        :meta private:
        """
        return [d.name for d in self.database_details]

    @property
    def database(self):
        """DEPRECATED. Use 'databases_details' instead.

        :meta private:
        """
        return self.databases[0]

    @property
    def status(self):
        """'QUEUED', 'ANNOTATING', 'FINISHED', or 'FAILED'"""
        return self._info['status']

    @property
    def submitter(self) -> DatasetUser:
        """Details about the submitter of the dataset"""
        return self._info['submitter']

    @property
    def group(self) -> Optional[DatasetGroup]:
        """The group (lab/institute/team/etc.) that this dataset belongs to"""
        return self._info['group']

    @property
    def projects(self) -> List[DatasetProject]:
        """The list of projects that include this project"""
        return self._info['projects']

    @property
    def principal_investigator(self) -> Optional[str]:
        """This field is usually only used for attributing the submitter's PI when the submitter
        is not associated with any group"""
        return (self._info['principalInvestigator'] or {}).get('name')

    @property
    def image_size(self):
        """Image size in pixels along the X, Y axes if this data exists otherwise an empty dict"""
        shape = {}
        if self._info['acquisitionGeometry'] != 'null':
            acquisition_grid = json.loads(self._info['acquisitionGeometry'])['acquisition_grid']
            shape['x'] = acquisition_grid['count_x']
            shape['y'] = acquisition_grid['count_y']
        return shape

    @property
    def _baseurl(self):
        return self._gqclient.host

    def isotope_images(
        self,
        sf,
        adduct,
        only_first_isotope=False,
        scale_intensity=True,
        hotspot_clipping=False,
        neutral_loss='',
        chem_mod='',
        image_metadata=[],
    ):
        """Retrieve ion images for a specific sf and adduct.

        :param str   sf:
        :param str   adduct:
        :param bool  only_first_isotope: Only retrieve the first (most abundant) isotopic ion image.
                                         Typically this is all you need for data analysis, as the less abundant isotopes
                                         are usually lower quality copies of the first isotopic ion image.
        :param bool  scale_intensity:    When True, the output values will be scaled to the intensity range of the original data.
                                         When False, the output values will be in the 0.0 to 1.0 range.
                                         When 'TIC', the output values will be scaled by the TIC and will be in the 0.0 to 1.0 range.
        :param bool  hotspot_clipping:   When True, apply hotspot clipping. Recommended if the images will be used for visualisation.
                                         This is required to get ion images that match the METASPACE website
        :param str   neutral_loss:
        :param str   chem_mod:
        :param list  image_metadata:
        :return IsotopeImages:
        """

        import matplotlib.image as mpimg

        def fetchImage(url):
            if not url:
                return None
            if not urlparse(url).netloc:
                # Ion images that have not been moved to S3 are sent as relative paths that need
                # a host prefixed. This fallback can likely be removed after 2021-04-01.
                url = self._baseurl + url

            try:
                im = mpimg.imread(BytesIO(self._session.get(url).content))
            except:
                # Retry, because occasionally the first request fails with a timeout
                im = mpimg.imread(BytesIO(self._session.get(url).content))
            mask = im[:, :, 3]
            data = im[:, :, 0]
            data[mask == 0] = 0
            assert data.max() <= 1
            return data

        if not image_metadata:
            records = self._gqclient.getAnnotations(
                {
                    'sumFormula': sf,
                    'adduct': adduct,
                    'databaseId': None,
                    'neutralLoss': neutral_loss,
                    'chemMod': chem_mod,
                },
                {'ids': self.id},
            )

            if records:
                image_metadata = records[0]['isotopeImages']

        if not image_metadata:
            raise LookupError(f'Isotope image for "{sf}{chem_mod}{neutral_loss}{adduct}" not found')
        if only_first_isotope:
            image_metadata = image_metadata[:1]

        images = [fetchImage(r.get('url')) for r in image_metadata]
        image_mzs = [r['mz'] for r in image_metadata]
        image_urls = [r['url'] for r in image_metadata]

        if isinstance(scale_intensity, np.ndarray):
            scale_image = scale_intensity
            scale_intensity = True
        elif scale_intensity == 'TIC':
            scale_image = self.tic_image()
            scale_intensity = True
        else:
            scale_image = None

        if scale_intensity is True:
            non_empty_images = [i for i in images if i is not None]
            if non_empty_images:
                shape = non_empty_images[0].shape
                for i in range(len(images)):
                    if images[i] is None:
                        images[i] = np.zeros(shape, dtype=non_empty_images[0].dtype)
                    else:
                        lo = float(image_metadata[i]['minIntensity'])
                        hi = float(image_metadata[i]['maxIntensity'])
                        images[i] = lo + images[i] * (hi - lo)

        if scale_image is not None:
            for i in range(len(images)):
                if images[i] is not None:
                    nonzero = scale_image > 0  # Handle NaNs and div-by-zero warnings
                    images[i] = np.divide(images[i], scale_image, where=nonzero)
                    images[i][~nonzero] = 0

        if hotspot_clipping:
            for i in range(len(images)):
                if images[i] is not None:
                    images[i] = clip_hotspots(images[i])
                    if not scale_intensity:
                        # Renormalize to 0-1 range
                        images[i] /= np.max(images[i]) or 1

        return IsotopeImages(images, sf, chem_mod, neutral_loss, adduct, image_mzs, image_urls)

    def all_annotation_images(
        self,
        fdr: float = 0.1,
        database: Union[int, str, Tuple[str, str]] = DEFAULT_DATABASE,
        only_first_isotope: bool = False,
        scale_intensity: Union[bool, _TIC_Literal, np.ndarray] = True,
        hotspot_clipping: bool = False,
        **annotation_filter,
    ) -> List[IsotopeImages]:
        """Retrieve all ion images for the dataset and given annotation filters.

        Args:
            fdr: Maximum FDR level of annotations.
            database: Molecular database name or id.
            only_first_isotope: Only retrieve the first (most abundant) isotopic ion image for each
                annotation. Typically this is all you need for data analysis, as the less abundant
                isotopes are usually lower quality copies of the first isotopic ion image.
            scale_intensity: When True, the output values will be scaled to the intensity range of
                the original data. When False, the output values will be in the 0.0 to 1.0 range.
                When 'TIC', the output values will be scaled by the TIC and will be in the
                0.0 to 1.0 range.
            hotspot_clipping:   When True, apply hotspot clipping. Recommended if the images will
                be used for visualisation. This is required to get ion images that match the
                METASPACE website
            annotation_filter: Additional filters passed to `SMDataset.annotations`.
        Returns:
            list of isotope images
        """
        if not isinstance(scale_intensity, np.ndarray) and scale_intensity == 'TIC':
            scale_intensity = self.tic_image()

        with ThreadPoolExecutor() as pool:

            def get_annotation_images(row):
                sf, adduct, neutral_loss, chem_mod, isotope_images = row
                return self.isotope_images(
                    sf,
                    adduct,
                    only_first_isotope=only_first_isotope,
                    scale_intensity=scale_intensity,
                    neutral_loss=neutral_loss,
                    chem_mod=chem_mod,
                    hotspot_clipping=hotspot_clipping,
                    image_metadata=isotope_images,
                )

            annotations = self.annotations(
                fdr=fdr,
                database=database,
                return_vals=('sumFormula', 'adduct', 'neutralLoss', 'chemMod', 'isotopeImages'),
                **annotation_filter,
            )
            return list(
                tqdm(
                    pool.map(
                        get_annotation_images,
                        annotations,
                    ),
                    total=len(annotations),
                    bar_format='{l_bar}{bar:40}{r_bar}{bar:-10b}',
                )
            )

    def optical_images(self):
        def fetch_image(url):
            from PIL import Image

            if not url:
                return None

            if not urlparse(url).netloc:
                # Images that have not been moved to S3 are sent as relative paths that need
                # a host prefixed. This fallback can be removed after
                # https://github.com/metaspace2020/metaspace/issues/803 is implemented
                url = self._baseurl + url
            im = Image.open(BytesIO(self._session.get(url).content))
            return np.asarray(im)

        raw_im = self._gqclient.getRawOpticalImage(self.id)['rawOpticalImage']
        return OpticalImage(fetch_image(raw_im['url']), np.asarray(raw_im['transform']))

    def download_links(self) -> Optional[DatasetDownload]:
        """Returns a data structure containing links to download the dataset's input files"""
        result = self._gqclient.query(
            '''query ($id: String!) {
            dataset (id: $id) { downloadLinkJson }
        }''',
            {'id': self.id},
        )
        download_link_json = result and result.get('dataset', {}).get('downloadLinkJson')
        if download_link_json:
            return json.loads(download_link_json)

    def download_to_dir(self, path, base_name=None):
        """Downloads the dataset's input files to the specified directory.

        :param path: Destination directory
        :param base_name: If specified, overrides the base name (excluding extension) of each file.
                          e.g. `base_name='foo'` will name the files as 'foo.imzML' and 'foo.ibd'
        :return:
        """

        def download_link(file: DatasetDownloadFile):
            prefix, suffix = os.path.splitext(file['filename'])
            dest_path = dest_root / ((base_name or prefix) + suffix)
            if not dest_path.exists():
                response = requests.get(file['link'], stream=True)
                with dest_path.open('wb') as dest:
                    copyfileobj(response.raw, dest)
                print(f'Wrote {dest_path}')
            else:
                print(f'File already exists: {dest_path}. Skipping.')

        dest_root = Path(path)
        if not dest_root.exists():
            print(f'Making directory {dest_root}')
            dest_root.mkdir(parents=True)

        link = self.download_links()
        if link:
            # Download in parallel to minimize risk that the imzML link expires before the ibd file
            # has finished downloading
            with ThreadPoolExecutor() as ex:
                ex.map(download_link, link['files'])

    def _get_diagnostic_image(self, image):
        url = image['url']
        fmt = image['format']
        key = (url, fmt)
        if key not in self._diagnostic_images:
            try:
                raw = BytesIO(self._session.get(url).content)
            except Exception:
                # Retry once in case of network error due to excessive parallelism
                raw = BytesIO(self._session.get(url).content)
            try:
                if fmt == 'PNG':
                    import matplotlib.image as mpimg

                    image_content = mpimg.imread(raw)
                elif fmt == 'NPY':
                    image_content = np.load(raw, allow_pickle=False)  # type: ignore
                elif fmt == 'JSON':
                    image_content = json.load(raw)
                elif fmt == 'PARQUET':
                    image_content = pd.read_parquet(raw)
                else:
                    print(f'Warning: Unrecognized format {fmt}, returning unparsed content')
                    image_content = raw
            except Exception as ex:
                print(f'Warning: Could not parse image {url}: {ex}')
                image_content = raw

            self._diagnostic_images[key] = image_content
        return self._diagnostic_images[key]

    def _mixin_diagnostic_images(self, images):
        """Update `images` to include the image content"""
        with ThreadPoolExecutor() as ex:
            for image, image_content in zip(images, ex.map(self._get_diagnostic_image, images)):
                image['image'] = image_content

    def diagnostics(self, include_images=True) -> List[DatasetDiagnostic]:
        """Retrieves all diagnostic information and additional metadata for the dataset.

        :param include_images: (default True) whether to download and include images in the results
        """
        if self._diagnostics is None:
            self._diagnostics = self._gqclient.get_dataset_diagnostics(self.id)
            assert self._diagnostics is not None, 'Dataset not found'
            # Convert databases to MolecularDB instances
            for diag in self._diagnostics:
                if diag['database'] is not None:
                    diag['database'] = MolecularDB(diag['database'])

        diagnostics = deepcopy(self._diagnostics)

        if include_images:
            self._mixin_diagnostic_images(
                [image for diag in diagnostics for image in diag.get('images') or []]
            )

        return diagnostics

    def diagnostic(self, type: str, database=None, include_images=True) -> DatasetDiagnostic:
        """Retrieves a specific item from the dataset's diagnostic information / additional metadata
        or raises an exception if it wasn't found
        :param type: The type of diagnostic/metadata. Valid values:
        type='TIC'
            `data` contains information about the Total Ion Current across the dataset
            `images` contains an image with the TIC for each spectrum
        type='IMZML_METADATA'
            `data` contains a summary of metadata from the ImzML file header
            `images` contains a boolean image of which pixels had spectra in the input data.
            Useful for non-square acquisition areas.
        :param database: The ID or (name, version) of the database. Needed for database-specific
            metadata types (currently not used)
        :param include_images: (default True) whether to download and include images in the results
        """

        database_id = database and self._gqclient.map_database_to_id(database)
        for diag in self.diagnostics(include_images=False):
            if diag['type'] == type and (diag['database'] or {}).get('id') == database_id:
                if include_images and diag['images']:
                    self._mixin_diagnostic_images(diag['images'])
                return diag

        raise KeyError(
            f'Could not find diagnostic item with type={repr(type)}, database={repr(database)}'
        )

    def tic_image(self) -> np.ndarray:
        """Returns a numpy array with the TIC value for each spectrum"""
        try:
            diag = self.diagnostic('TIC', include_images=True)
            return [image['image'] for image in diag['images'] if image['key'] == 'TIC'][0]
        except Exception:
            raise KeyError('TIC image not found - the dataset is likely still being processed')


class MolecularDB:
    def __init__(self, info):
        self._info = info

    @property
    def id(self) -> int:
        return self._info['id']

    @property
    def name(self) -> str:
        return self._info['name']

    @property
    def version(self) -> str:
        return self._info['version']

    @property
    def is_public(self) -> bool:
        return self._info['isPublic']

    @property
    def archived(self) -> bool:
        return self._info['archived']

    def __repr__(self):
        return f'<{self.id}:{self.name}:{self.version}>'

    def __getitem__(self, item):
        """Compatibility shim for accessing properties as dictionary entries, to keep compatibility
        with the TypedDict implementation in `DatabaseDetails`. New code should use the
        class properties directly instead of accessing this like a dict."""
        return self._info[item]


class ScoringModel:
    def __init__(self, info):
        self._info = info

    @property
    def id(self) -> int:
        return self._info['id']

    @property
    def name(self) -> str:
        return self._info['name']

    @property
    def version(self) -> str:
        return self._info['version']

    @property
    def type(self) -> str:
        return self._info['type']

    @property
    def is_archived(self) -> bool:
        return self._info['isArchived']

    def __repr__(self):
        return f'<{self.id}:{self.name}:{self.version}:{self.type}>'

    def __getitem__(self, item):
        return self._info[item]


class SMInstance(object):
    """Client class for communication with the Metaspace API."""

    def __init__(
        self,
        host: str = None,
        verify_certificate: bool = True,
        email: str = None,
        password: str = None,
        api_key: str = None,
        config_path: str = None,
    ):
        """
        Args:
            host: Full host name, e.g. 'https://metaspace2020.org'
            verify_certificate: Ignore certificate validation.
            email: User email.
            password: User password.
            api_key: User API key.
            config_path: Configuration file path.
        """
        self._config = get_config(host, verify_certificate, email, password, api_key, config_path)
        if not self._config['verify_certificate']:
            import warnings
            from urllib3.exceptions import InsecureRequestWarning

            warnings.filterwarnings('ignore', category=InsecureRequestWarning)

        try:
            self.reconnect()
        except (AssertionError, BadRequestException) as ex:
            message = ex.args[0] if ex.args else ''
            if ('Invalid API key' in message or 'Login failed' in message) and (
                api_key is None and email is None
            ):
                print(
                    f'Login failed. Call sm.save_login(overwrite=True) to update your '
                    f'saved credentials.'
                )
            else:
                print(f'Failed to connect to {self._config["host"]}: {message}')

    def __repr__(self):
        return "SMInstance({})".format(self._config['graphql_url'])

    def save_login(self, overwrite=False):
        """Saves login credentials to the config file so that they will be automatically loaded
        in future uses of SMInstance()"""
        config_path = Path.home() / '.metaspace'
        if config_path.exists() and not overwrite:
            print(f'{config_path} already exists. Call sm.save_login(overwrite=True) to overwrite.')
            return

        api_key = getpass(
            f'Please generate an API key at https://metaspace2020.org/user/me and enter it here '
            f'(or leave blank to cancel):'
        )
        api_key = api_key.strip()
        if not api_key:
            print('Cancelled')
            return

        try:
            self.login(api_key=api_key)
        except:
            print(f'Login failed. Please check your API key and try again.')
            return

        config_path.open('w').write(f'api_key={api_key}')

        print(f'Saved API key to {config_path}')

    def login(self, email=None, password=None, api_key=None):
        """
        DEPRECATED. Avoid calling this directly - pass credentials to SMInstance directly instead.
        This function is kept for backwards compatibility

        :meta private:
        """
        assert (
            email and password
        ) or api_key, 'Either email and password, or api_key must be provided'
        self._config['usr_email'] = email
        self._config['usr_pass'] = password
        self._config['usr_api_key'] = api_key
        self.reconnect()
        assert self._gqclient.logged_in, 'Login failed'

    def reconnect(self):
        """:meta private:"""
        self._gqclient = GraphQLClient(self._config)
        self._es_client = None

    def logged_in(self):
        """:meta private:"""
        return self._gqclient.logged_in

    @property
    def projects(self):
        """
        Sub-object containing methods for interacting with projects.

        :rtype: metaspace.projects_client.ProjectsClient
        """
        from metaspace.projects_client import ProjectsClient

        return ProjectsClient(self._gqclient)

    def _check_projects(self, project_ids):
        wrong_project_ids = []
        for project_id in project_ids:
            if self.projects.get_project(project_id) is None:
                wrong_project_ids.append(project_id)
        if wrong_project_ids:
            raise Exception(f'The next project_ids is not valid: {", ".join(wrong_project_ids)}')

    def dataset(self, name=None, id=None) -> SMDataset:
        """Retrieve a dataset by id (preferred) or name.

        You can get a dataset's ID by viewing its annotations online and looking at the URL, e.g.
        in this URL: :samp:`metaspace2020.org/annotations?ds={2016-09-22_11h16m17s}`
        the dataset ID is ``2016-09-22_11h16m17s``
        """
        if id:
            return SMDataset(self._gqclient.getDataset(id), self._gqclient)
        elif name:
            return SMDataset(self._gqclient.getDatasetByName(name), self._gqclient)
        else:
            raise Exception("either name or id must be provided")

    def datasets(
        self,
        nameMask: Optional[str] = None,
        idMask: Union[str, List[str], None] = None,
        *,
        submitter_id: Optional[str] = None,
        group_id: Optional[str] = None,
        project_id: Optional[str] = None,
        polarity: Optional[Polarity] = None,
        ionisation_source: Optional[str] = None,
        analyzer_type: Optional[str] = None,
        maldi_matrix: Optional[str] = None,
        organism: Optional[str] = None,
        **kwargs,
    ) -> List[SMDataset]:
        """
        Search for datasets that match the given criteria. If no criteria are given, it will
        return all accessible datasets on METASPACE.

        :param nameMask: Search string to be applied to the dataset name
        :param idMask: Dataset ID or list of IDs
        :param submitter_id: User ID of the submitter
        :param group_id:
        :param project_id:
        :param polarity: 'Positive' or 'Negative'
        :param ionisation_source:
        :param analyzer_type:
        :param maldi_matrix:
        :param organism:
        :return:
        """
        datasetFilter = kwargs.copy()
        if nameMask is not None:
            datasetFilter['name'] = nameMask
        if idMask is not None:
            datasetFilter['ids'] = idMask if isinstance(idMask, str) else "|".join(idMask)
        if submitter_id is not None:
            datasetFilter['submitter'] = submitter_id
        if group_id is not None:
            datasetFilter['group'] = group_id
        if project_id is not None:
            datasetFilter['project'] = project_id
        if polarity is not None:
            datasetFilter['polarity'] = polarity.upper()
        if ionisation_source is not None:
            datasetFilter['ionisationSource'] = ionisation_source
        if analyzer_type is not None:
            datasetFilter['analyzerType'] = analyzer_type
        if maldi_matrix is not None:
            datasetFilter['maldiMatrix'] = maldi_matrix
        if organism is not None:
            datasetFilter['organism'] = organism

        return [
            SMDataset(info, self._gqclient) for info in self._gqclient.getDatasets(datasetFilter)
        ]

    def metadata(self, datasets):
        """
        DEPRECATED - SMInstance.datasets should be preferred
        Pandas dataframe for a subset of datasets
        where rows are flattened metadata JSON objects

        :meta private:
        """
        df = json_normalize([d.metadata.json for d in datasets])
        df.index = [d.name for d in datasets]
        return df

    def get_annotations(self, fdr=0.1, db_name="HMDB-v4", datasetFilter={}):
        """
        DEPRECATED
        This function does not work as previously described, and is kept only for backwards compatibility.
        Use sm.dataset(id='...').results() or sm.dataset(id='...').annotations() instead.

        :meta private:
        """
        records = self._gqclient.getAnnotations(
            annotationFilter={'database': db_name, 'fdrLevel': fdr}, datasetFilter=datasetFilter
        )
        df = json_normalize(records)
        return pd.DataFrame(
            dict(
                formula=df['sumFormula'],
                adduct=df['adduct'],
                msm=df['msmScore'],
                moc=df['rhoChaos'],
                rhoSpatial=df['rhoSpatial'],
                rhoSpectral=df['rhoSpectral'],
                fdr=df['fdrLevel'],
                mz=df['mz'],
                dataset_id=df['dataset.id'],
                dataset_name=df['dataset.name'],
                moleculeNames=[[item['name'] for item in lst] for lst in df['possibleCompounds']],
            )
        )

    def get_metadata(self, datasetFilter={}):
        """
        DEPRECATED - SMInstance.datasets should be preferred
        Pandas dataframe for a subset of datasets
        where rows are flattened metadata JSON objects

        :meta private:
        """
        datasets = self._gqclient.getDatasets(datasetFilter=datasetFilter)
        df = pd.concat(
            [
                pd.DataFrame(json_normalize(json.loads(dataset['metadataJson'])))
                for dataset in datasets
            ],
            sort=False,
        )
        df.index = [dataset['id'] for dataset in datasets]
        return df

    def submit_dataset(
        self,
        imzml_fn: Optional[str],
        ibd_fn: Optional[str],
        name: str,
        metadata: Union[str, dict],
        is_public: bool,
        databases: List[Union[int, str, Tuple[str, str]]] = [DEFAULT_DATABASE],
        *,
        project_ids: Optional[List[str]] = None,
        adducts: Optional[List[str]] = None,
        neutral_losses: Optional[List[str]] = None,
        chem_mods: Optional[List[str]] = None,
        ppm: Optional[float] = None,
        num_isotopic_peaks: Optional[int] = None,
        decoy_sample_size: Optional[int] = None,
        scoring_model: Optional[int] = None,
        input_path: Optional[str] = None,
        description: Optional[str] = None,
        perform_enrichment: Optional[bool] = False,
    ) -> str:
        """Submit a dataset for processing in METASPACE.

        :param imzml_fn: Path to the imzML file to upload
        :param ibd_fn: Path to the ibd file to upload
        :param name: New dataset name
        :param metadata: A JSON string or Python dict containing metadata. This must exactly follow
            the expected format - see the `submit dataset example notebook`_.

        :param is_public: If True, the dataset will be publicly visible.
            If False, it will only be visible to yourself, other members of your Group,
            METASPACE administrators, and members of any Projects you add it to
        :param databases: List of databases to process with, either as IDs or (name, version)
            tuples, e.g. [22, ('LipidMaps', '2017-12-12')]
        :param project_ids: A list of project IDs to add this dataset to.
        :param adducts: List of adducts. e.g. ['-H', '+Cl']
            Normal adducts should be plus or minus followed by an element.
            For radical ions/cations, use the special strings '[M]+' or '[M]-'.
        :param neutral_losses: List of neutral losses, e.g. ['-H2O', '-CO2']
        :param chem_mods:
        :param ppm: m/z tolerance (in ppm) for generating ion images (default 3.0)
        :param num_isotopic_peaks: Number of isotopic peaks to search for (default 4)
        :param decoy_sample_size: Number of implausible adducts to use for generating the decoy
            search database (default 20)
        :param scoring_model:
        :param input_path: To clone an existing dataset, specify input_path using the value of the
            existing dataset's "s3dir".
            When input_path is suppled, imzml_fn and ibd_fn can be set to None.
        :param description: Optional text to describe the dataset
        :param perform_enrichment: Optional enable LION for dataset.

        :return: The newly created dataset ID

        .. _submit dataset example notebook: ../examples/submit-dataset.ipynb
        """
        current_user_id = self.current_user_id()
        assert current_user_id, 'You must be logged in to submit a dataset'

        primary_group_id = self._gqclient.get_primary_group_id()
        database_ids = [self._gqclient.map_database_to_id(db) for db in databases or []]
        scoring_model_id = self._gqclient.map_scoring_model_to_id(scoring_model)

        if isinstance(metadata, str):
            metadata = json.loads(metadata)

        # Set default adducts
        if not adducts:
            polarity = metadata['MS_Analysis']['Polarity']
            if polarity == 'Positive':
                adducts = ['+H', '+Na', '+K']
            elif polarity == 'Negative':
                adducts = ['-H', '+Cl']
            else:
                raise Exception('Polarity set incorrectly, available only "Positive" or "Negative"')

        # check the existence of projects by their project_id
        if project_ids:
            self._check_projects(project_ids)

        if description:
            description_json = _str_to_tiptap_markup(description)
        else:
            description_json = None

        # Upload the files. Keep this as late as possible to minimize chances of error after upload
        file_size = None
        if input_path is None:
            assert imzml_fn and ibd_fn, 'imzml_fn and ibd_fn must be supplied'
            input_path = _dataset_upload(
                imzml_fn, ibd_fn, self._config['dataset_upload_url'], current_user_id
            )
            file_size = {
                'imzml_size': Path(imzml_fn).stat().st_size,
                'ibd_size': Path(ibd_fn).stat().st_size,
            }

        graphql_response = self._gqclient.create_dataset(
            {
                'name': name,
                'inputPath': input_path,
                'description': description_json,
                'metadataJson': json.dumps(metadata),
                'sizeHashJson': json.dumps(file_size) if file_size else None,
                'databaseIds': database_ids,
                'adducts': adducts,
                'neutralLosses': neutral_losses,
                'chemMods': chem_mods,
                'ppm': ppm,
                'numPeaks': num_isotopic_peaks,
                'decoySampleSize': decoy_sample_size,
                'scoringModelId': scoring_model_id,
                'submitterId': current_user_id,
                'groupId': primary_group_id,
                'projectIds': project_ids,
                'isPublic': is_public,
            },
            perform_enrichment=perform_enrichment,
        )
        return json.loads(graphql_response)['datasetId']

    def update_dataset_dbs(self, dataset_id, molDBs=None, adducts=None):
        self.update_dataset(dataset_id, databases=molDBs, adducts=adducts, reprocess=True)

    def reprocess_dataset(self, dataset_id, force=False):
        self._gqclient.update_dataset(ds_id=dataset_id, reprocess=True, force=force)

    def update_dataset(
        self,
        id: str,
        *,
        name: Optional[str] = None,
        metadata: Any = None,
        databases=None,
        adducts: Optional[List[str]] = None,
        neutral_losses: Optional[List[str]] = None,
        chem_mods: Optional[List[str]] = None,
        is_public: Optional[List[str]] = None,
        ppm: Optional[float] = None,
        num_isotopic_peaks: Optional[int] = None,
        decoy_sample_size: Optional[int] = None,
        scoring_model: Optional[int] = None,
        reprocess: Optional[bool] = None,
        force: bool = False,
        perform_enrichment: Optional[bool] = False,
    ):
        """Updates a dataset's metadata and/or processing settings. Only specify the fields that
        should change. All arguments should be specified as keyword arguments,
        e.g. to update a dataset's adducts:

        >>> sm.update_dataset(
        >>>     id='2018-11-07_14h15m28s',
        >>>     adducts=['[M]+', '+H', '+K', '+Na'],
        >>> )

        :param id: (Required) ID of an existing dataset
        :param name: New dataset name
        :param metadata: A JSON string or Python dict containing updated metadata
        :param databases: List of databases to process with, either as IDs or (name, version)
            tuples, e.g. [22, ('LipidMaps', '2017-12-12')]
        :param adducts: List of adducts. e.g. ['-H', '+Cl']
            Normal adducts should be plus or minus followed by an element.
            For radical ions/cations, use the special strings '[M]+' or '[M]-'.
        :param neutral_losses: List of neutral losses, e.g. ['-H2O', '-CO2']
        :param chem_mods:
        :param is_public: If True, the dataset will be publicly visible.
            If False, it will only be visible to yourself, other members of your Group,
            METASPACE administrators, and members of any Projects you add it to
        :param ppm: m/z tolerance (in ppm) for generating ion images (default 3.0)
        :param num_isotopic_peaks: Number of isotopic peaks to search for (default 4)
        :param decoy_sample_size: Number of implausible adducts to use for generating the decoy
            search database (default 20)
        :param scoring_model:
        :param reprocess:
            None (default): Reprocess if needed
            True: Force reprocessing, even if not needed
            False: Raise an error if the changes would require reprocessing
        :param force:
            True: Allow changes to datasets that are already being processed. This should be used
            with caution, as it can cause errors or inconsistent results.
        :param perform_enrichment: Optional enable LION for dataset.
        """

        input_field = {}

        if name is not None:
            input_field['name'] = name
        if metadata is not None:
            if isinstance(metadata, str):
                input_field['metadataJson'] = metadata
            else:
                input_field['metadataJson'] = json.dumps(metadata)
        if databases is not None:
            input_field['databaseIds'] = [self._gqclient.map_database_to_id(db) for db in databases]
        if adducts is not None:
            input_field['adducts'] = adducts
        if neutral_losses is not None:
            input_field['neutralLosses'] = neutral_losses
        if chem_mods is not None:
            input_field['chemMods'] = chem_mods
        if is_public is not None:
            input_field['isPublic'] = is_public
        if ppm is not None:
            input_field['ppm'] = ppm
        if num_isotopic_peaks is not None:
            input_field['numPeaks'] = num_isotopic_peaks
        if decoy_sample_size is not None:
            input_field['decoySampleSize'] = decoy_sample_size
        if scoring_model is not None:
            input_field['scoringModelId'] = self._gqclient.map_scoring_model_to_id(scoring_model)

        try:
            self._gqclient.update_dataset(
                id, input_field, reprocess or False, force, perform_enrichment
            )
        except GraphQLException as ex:
            if ex.type == 'reprocessing_needed' and reprocess is None:
                self._gqclient.update_dataset(id, input_field, True, force, perform_enrichment)
            else:
                raise

    def delete_dataset(self, ds_id, **kwargs):
        return self._gqclient.delete_dataset(ds_id, **kwargs)

    def database(
        self, name: str = None, version: str = None, id: int = None
    ) -> Optional[MolecularDB]:
        """Fetch molecular database by id."""

        databases = self._gqclient.get_visible_databases()
        db_match = None
        if id:
            for db in databases:
                if db['id'] == id:
                    db_match = db

        elif name and version:
            for db in databases:
                if db['name'] == name and db['version'] == version:
                    db_match = db

        else:
            name, version = self._gqclient.map_database_name_to_name_version(name)
            for db in databases:
                if db['name'] == name and db['version'] == version:
                    db_match = db

        return db_match and MolecularDB(db_match)

    def scoring_models(self) -> List[ScoringModel]:
        sms = sorted(self._gqclient.get_visible_scoring_models(), key=lambda sm: sm['id'])
        return [ScoringModel(sm) for sm in sms]

    def databases(self) -> List[MolecularDB]:
        dbs = sorted(self._gqclient.get_visible_databases(), key=lambda db: db['id'])
        return [MolecularDB(db) for db in dbs]

    def create_database(
        self,
        local_path: Union[str, Path],
        name: str,
        version: str,
        is_public: bool = False,
        groupId: str = None,
    ) -> dict:
        return self._gqclient.create_database(local_path, name, version, is_public, groupId)

    def update_database(self, id: int, is_public: bool = None, archived: bool = None) -> dict:
        return self._gqclient.update_database(id, is_public, archived)

    def delete_database(self, id: int) -> bool:
        return self._gqclient.delete_database(id)

    def current_user_id(self):
        result = self._gqclient.query("""query { currentUser { id } }""")
        return result['currentUser'] and result['currentUser']['id']

    def add_dataset_external_link(
        self, dataset_id: str, provider: str, link: str, replace_existing=False
    ):
        """
        Note that the current user must be the submitter of the dataset being edited.

        :param dataset_id:
        :param provider: Must be a known 3rd party link provider name.
                         Contact us if you're interested in integrating with METASPACE.
        :param link:
        :param replace_existing: pass True to overwrite existing links from the same provider
        :return: The updated list of external links
        """

        result = self._gqclient.query(
            """mutation($datasetId: String!, $provider: String!, $link: String!,
                        $replaceExisting: Boolean!) {
                addDatasetExternalLink(datasetId: $datasetId, provider: $provider, link: $link,
                                       replaceExisting: $replaceExisting) {
                    externalLinks { provider link }
                }
            }""",
            {
                'datasetId': dataset_id,
                'provider': provider,
                'link': link,
                'replaceExisting': replace_existing,
            },
        )
        return result['addDatasetExternalLink']['externalLinks']

    def upload_raw_opt_image_to_s3(self, local_path: Union[str, Path], dataset_id: str) -> str:
        """
        Upload optical raw image local file to s3 bucket

        >>> sm.upload_opt_file_to_s3(
        >>>     local_path='/tmp/image.png',
        >>>     dataset_id='2018-11-07_14h15m28s',
        >>> )

        :param local_path:
        :param dataset_id:
        :return: Returns file s3 key
        """

        current_user_id = self.current_user_id()
        assert current_user_id, 'You must be logged in to submit a dataset'

        url = f'{self._config["dataset_upload_url"]}/s3/uuid'
        resp = requests.get(url)
        resp.raise_for_status()
        headers = resp.json()
        multipart_upload(
            local_path,
            self._config['raw_opt_upload_url'],
            file_type='image/png',
            headers=headers,
            current_user_id=current_user_id,
            dataset_id=dataset_id,
        )
        return headers['uuid']

    def upload_optical_image(
        self,
        local_path: Union[str, Path],
        dataset_id: str,
        transformation_matrix: np.ndarray = np.array(
            [
                [1, 0, 0],
                [0, 1, 0],
                [0, 0, 1],
            ]
        ),
    ) -> str:
        """
        Upload optical image from local file

        >>> sm.upload_optical_image(
        >>>     local_path='/tmp/image.png',
        >>>     dataset_id='2018-11-07_14h15m28s',
        >>>     transformation_matrix=np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1], ]),
        >>> )

        :param local_path:
        :param dataset_id:
        :param transformation_matrix:
        :return: Returns file s3 key
        """

        image_uuid = self.upload_raw_opt_image_to_s3(local_path=local_path, dataset_id=dataset_id)
        query = """
            mutation addOpticalImage($imageUrl: String!,
                $datasetId: String!, $transform: [[Float]]!) {
                addOpticalImage(input: {datasetId: $datasetId,
                                        imageUrl: $imageUrl, transform: $transform})
              }
        """

        variables = {
            'datasetId': dataset_id,
            'imageUrl': image_uuid,
            'transform': transformation_matrix.tolist(),
        }

        return self._gqclient.query(query, variables)['addOpticalImage']

    def get_optical_image_transform(self, dataset_id: str):
        """
        Get optical image transform matrix

        matrix3d(${t[0][0]}, ${t[1][0]}, 0, ${t[2][0]},
             ${t[0][1]}, ${t[1][1]}, 0, ${t[2][1]},
                      0,          0, 1,          0,
             ${t[0][2]}, ${t[1][2]}, 0, ${t[2][2]})

        >>> sm.get_optical_image_transform(
        >>>     dataset_id='2018-11-07_14h15m28s',
        >>> )

        :param dataset_id:
        :return: Returns matrix 3d values
        """
        return self._gqclient.getRawOpticalImage(dataset_id)['rawOpticalImage']['transform']

    def get_optical_image_path(self, dataset_id: str):
        """
        Get optical image file path

        >>> sm.get_optical_image_path(
        >>>     dataset_id='2018-11-07_14h15m28s',
        >>> )

        :param dataset_id:
        :return: Returns src path
        """
        return self._gqclient.getRawOpticalImage(dataset_id)['rawOpticalImage']['url']

    def copy_optical_image(self, origin_dataset_id: str, destiny_dataset_id: str):
        """
        Copies an optical image from a dataset to another

        >>> sm.copy_optical_image(
        >>>     origin_dataset_id='2018-11-07_14h15m28s',
        >>>     destiny_dataset_id='2018-11-07_14h15m30s',
        >>> )

        :param origin_dataset_id:
            The dataset ID of the origin dataset with the optical image to be copied
        :param destiny_dataset_id:
            The dataset ID from the dataset to where the optical image will be copied to
        :return: The updated list of external links
        """

        copy_file_query = """
            mutation copyRawOpticalImage($originDatasetId: String!,
                $destinyDatasetId: String!) {
                copyRawOpticalImage(originDatasetId: $originDatasetId, 
                    destinyDatasetId: $destinyDatasetId)
              }
        """
        copy_variables = {
            'originDatasetId': origin_dataset_id,
            'destinyDatasetId': destiny_dataset_id,
        }

        copied_file = self._gqclient.query(copy_file_query, copy_variables)['copyRawOpticalImage']

        query = """
            mutation addOpticalImage($imageUrl: String!,
                $datasetId: String!, $transform: [[Float]]!) {
                addOpticalImage(input: {datasetId: $datasetId,
                                        imageUrl: $imageUrl, transform: $transform})
              }
        """

        variables = {
            'datasetId': destiny_dataset_id,
            'imageUrl': copied_file,
            'transform': self.get_optical_image_transform(origin_dataset_id),
        }

        return self._gqclient.query(query, variables)['addOpticalImage']

    def remove_dataset_external_link(
        self, dataset_id: str, provider: str, link: Optional[str] = None
    ):
        """
        Note that the current user must be the submitter of the dataset being edited.

        :param dataset_id:
        :param provider:
        :param link: If None, all links from the provider will be removed
        :return: The updated list of external links
        """

        result = self._gqclient.query(
            """mutation($datasetId: String!, $provider: String!, $link: String!) {
                removeDatasetExternalLink(datasetId: $datasetId, provider: $provider, link: $link) {
                    externalLinks { provider link }
                }
            }""",
            {'datasetId': dataset_id, 'provider': provider, 'link': link},
        )
        return result['removeDatasetExternalLink']['externalLinks']


def plot_diff(ref_df, dist_df, t='', xlabel='', ylabel='', col='msm'):
    import plotly.graph_objs as go
    from plotly.offline import iplot

    plot_df = dist_df.join(ref_df, rsuffix='_ref', how='inner').dropna()

    text_tmpl = (
        '{}{}<br>X: moc={:.3f} spat={:.3f} spec={:.3f}' '<br>Y: moc={:.3f} spat={:.3f} spec={:.3f}'
    )

    traces = []
    adducts = plot_df.index.get_level_values('adduct').unique()
    for adduct in adducts:
        df = plot_df.xs(adduct, level='adduct')
        txt = df.reset_index().apply(
            lambda r: text_tmpl.format(
                r.sf, adduct, r.moc_ref, r.spat_ref, r.spec_ref, r.moc, r.spat, r.spec
            ),
            axis=1,
        )

        if df.empty:
            continue

        traces.append(
            go.Scatter(
                x=df['{}_ref'.format(col)],
                y=df['{}'.format(col)],
                text=txt,
                mode='markers',
                name=adduct,
            )
        )

    data = go.Data(traces)
    fig = go.Figure(
        data=data,
        layout=go.Layout(
            autosize=False,
            height=500,
            hovermode='closest',
            title=t + ' \'{}\' values'.format(col),
            width=500,
            xaxis=go.XAxis(
                autorange=False,
                range=[-0.05675070028979684, 1.0323925590539844],  # what the fuck is this?
                title=xlabel,
                type='linear',
            ),
            yaxis=go.YAxis(
                autorange=False,
                range=[-0.0015978995361995152, 1.0312345837176764],  # what the fuck is this?
                title=ylabel,
                type='linear',
            ),
        ),
    )
    iplot(fig, filename='ref_dist_msm_scatter')
    tmp_df = plot_df.dropna()
    return tmp_df


class DataframeTree(object):
    """
    Class for hierarchical clustering of Pandas dataframes.

    The intended usage is for making sense out of data returned by SMInstance.msm_scores
    """

    def __init__(self, df, method='ward', metric='euclidean'):
        import scipy.cluster.hierarchy as sch

        self._df = df
        self._Z = sch.linkage(self._df, method=method, metric=metric)
        self._root = DataframeNode(self._df, sch.to_tree(self._Z))

    @property
    def root(self):
        return self._root

    @property
    def df(self):
        """
        Dataframe reordered according to pre-order tree traversal.
        """
        return self.root.df

    @property
    def left(self):
        return self.root.left

    @property
    def right(self):
        return self.root.right

    def row_names(self):
        return list(self.df.index)

    def column_names(self):
        return list(self.df.columns)


class DataframeNode(object):
    def __init__(self, df, node):
        self._df = df
        self._node = node
        self._node_df = None
        self._left_node = None
        self._right_node = None

    @property
    def is_leaf(self):
        return self._node.is_leaf()

    @property
    def left(self):
        if self._left_node is None:
            self._left_node = DataframeNode(self._df, self._node.get_left())
        return self._left_node

    @property
    def right(self):
        if self._right_node is None:
            self._right_node = DataframeNode(self._df, self._node.get_right())
        return self._right_node

    @property
    def df(self):
        if self._node_df is None:
            self._node_df = self._df.iloc[self._node.pre_order(lambda x: x.get_id())]
        return self._node_df

    def row_names(self):
        return list(self.df.index)

    def column_names(self):
        return list(self.df.columns)


class DatasetNotFound(Exception):
    pass


# Specify __all__ so that Sphinx documents everything in order from most to least interesting
__all__ = [
    'SMInstance',
    'SMDataset',
    'MolecularDB',
    'ScoringModel',
    'IsotopeImages',
    'OpticalImage',
    'GraphQLClient',
    'MetaspaceException',
    'DatasetNotFound',
    'GraphQLException',
    'BadRequestException',
    'InvalidResponseException',
]
