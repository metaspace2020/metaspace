import json
import math
import os
import pprint
import re
import urllib.parse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from io import BytesIO
from pathlib import Path
from shutil import copyfileobj
from typing import Optional, List, Iterable, Union, Tuple, Any, TYPE_CHECKING
from urllib.parse import urlparse

import numpy as np
import pandas as pd
import requests
from PIL import Image

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

    host = host or 'https://metaspace2020.eu'
    return {
        'host': host,
        'graphql_url': '{}/graphql'.format(host),
        'moldb_url': '{}/mol_db/v1'.format(host),
        'signin_url': '{}/api_auth/signin'.format(host),
        'gettoken_url': '{}/api_auth/gettoken'.format(host),
        'database_upload_url': f'{host}/database_upload',
        'dataset_upload_url': f'{host}/dataset_upload',
        'usr_email': email,
        'usr_pass': password,
        'usr_api_key': api_key,
        'verify_certificate': verify_certificate,
    }


def multipart_upload(local_path, companion_url, file_type, headers={}):
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

    def init_multipart_upload(filename, file_type, headers={}):
        url = companion_url + '/s3/multipart'
        data = {
            'filename': filename,
            'type': file_type,
            'metadata': {'name': filename, 'type': file_type},
        }
        resp_data = send_request(url, 'POST', json=data, headers=headers)
        return resp_data['key'], resp_data['uploadId']

    def sign_part_upload(key, upload_id, part):
        query = urllib.parse.urlencode({'key': key})
        url = f'{companion_url}/s3/multipart/{upload_id}/{part}?{query}'
        resp_data = send_request(url, max_retries=2)
        return resp_data['url']

    def upload_part(presigned_url, data):
        resp_data = send_request(
            presigned_url,
            'PUT',
            data=data,
            headers=headers,
            return_headers=True,
            max_retries=2,
        )
        return resp_data['ETag']

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
                file_data = f.read(part_size_mb * 1024 ** 2)
                if not file_data:
                    break

                part += 1
                print(f'Uploading part {part:3}/{n_parts:3} of {Path(local_path).name} file...')
                presigned_url = sign_part_upload(key, upload_id, part)
                yield part, presigned_url, file_data

    session = requests.Session()
    key, upload_id = init_multipart_upload(Path(local_path).name, file_type, headers=headers)

    with ThreadPoolExecutor(8) as ex:
        etags = list(
            ex.map(
                lambda args: (args[0], upload_part(*args[1:])),
                iterate_file(key, upload_id, local_path),
            )
        )

    bucket = complete_multipart_upload(key, upload_id, etags)
    return bucket, key


def _dataset_upload(imzml_fn, ibd_fn, companion_url):
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
    An editor for composing GraphQL API queries can be found at https://metaspace2020.eu/graphql
    """

    def __init__(self, config):
        self._config = config
        self.host = self._config['host']
        self.session = requests.Session()
        self.session.verify = self._config['verify_certificate']
        self.logged_in = False

        if self._config.get('usr_api_key'):
            self.logged_in = self.query('query { currentUser { id } }') is not None
        elif self._config['usr_email']:
            login_res = self.session.post(
                self._config['signin_url'],
                params={'email': self._config['usr_email'], 'password': self._config['usr_pass']},
            )
            if login_res.status_code == 401:
                print('Login failed. Only public datasets will be accessible.')
            elif login_res.status_code:
                self.logged_in = True
            else:
                login_res.raise_for_status()

    def query(self, query, variables={}):
        api_key = self._config.get('usr_api_key')
        if api_key:
            headers = {'Authorization': f'Api-Key {api_key}'}
        else:
            headers = {'Authorization': 'Bearer ' + self.get_jwt()}

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

    def _get_dataset_upload_uuid(self):
        url = f'{self._config["dataset_upload_url"]}/s3/uuid'
        resp = requests.get(url)
        resp.raise_for_status()
        return resp.json()

    def create_dataset(self, input_params, ds_id=None):
        query = """
            mutation createDataset($id: String, $input: DatasetCreateInput!, $priority: Int, $useLithops: Boolean) {
                createDataset(
                  id: $id,
                  input: $input,
                  priority: $priority,
                  useLithops: $useLithops,
                )
            }
        """
        variables = {
            'id': ds_id,
            'input': input_params,
            'useLithops': True,
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
        input=None,
        reprocess=False,
        force=False,
        priority=1,
    ):
        query = """
            mutation updateMetadataDatabases($id: String!, $reprocess: Boolean,
                $input: DatasetUpdateInput!, $priority: Int, $force: Boolean) {
                    updateDataset(
                      id: $id,
                      input: $input,
                      priority: $priority,
                      reprocess: $reprocess,
                      force: $force
                    )
            }
        """

        variables = {
            'id': ds_id,
            'input': input,
            'priority': priority,
            'reprocess': reprocess,
            'force': force,
        }

        self.query(query, variables)

    def create_database(
        self, local_path: Union[str, Path], name: str, version: str, is_public: bool = False
    ) -> dict:
        # TODO: s3 -> s3a in GraphQL
        bucket, key = multipart_upload(local_path, self._config['database_upload_url'], 'text/csv')
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
                "groupId": self.get_primary_group_id(),
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
                intensity=df.isotopeImages.apply(lambda imgs: imgs[0]['maxIntensity']),
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
        :return IsotopeImages:
        """
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

        if records:
            image_metadata = records[0]['isotopeImages']
        else:
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
                sf, adduct, neutral_loss, chem_mod = row
                return self.isotope_images(
                    sf,
                    adduct,
                    only_first_isotope=only_first_isotope,
                    scale_intensity=scale_intensity,
                    neutral_loss=neutral_loss,
                    chem_mod=chem_mod,
                    hotspot_clipping=hotspot_clipping,
                )

            annotations = self.annotations(
                fdr=fdr,
                database=database,
                return_vals=('sumFormula', 'adduct', 'neutralLoss', 'chemMod'),
                **annotation_filter,
            )
            return list(
                pool.map(
                    get_annotation_images,
                    annotations,
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
        key = (image['url'], image['format'])
        if key not in self._diagnostic_images:
            try:
                raw = BytesIO(self._session.get(image['url']).content)
            except Exception:
                # Retry once in case of network error due to excessive parallelism
                raw = BytesIO(self._session.get(image['url']).content)

            if format == 'PNG':
                import matplotlib.image as mpimg

                image_content = mpimg.imread(raw)
            else:
                image_content = np.load(raw, allow_pickle=False)  # type: ignore

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
            self._mixin_diagnostic_images(image for diag in diagnostics for image in diag['images'])

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
            host: Full host name, e.g. 'https://metaspace2020.eu'
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
        self.reconnect()

    def __repr__(self):
        return "SMInstance({})".format(self._config['graphql_url'])

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
        in this URL: :samp:`metaspace2020.eu/annotations?ds={2016-09-22_11h16m17s}`
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
        analysis_version: Optional[int] = None,
        input_path: Optional[str] = None,
        description: Optional[str] = None,
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
        :param analysis_version:
        :param input_path: To clone an existing dataset, specify input_path using the value of the
            existing dataset's "s3dir".
            When input_path is suppled, imzml_fn and ibd_fn can be set to none None.
        :param description: Optional text to describe the dataset

        :return: The newly created dataset ID

        .. _submit dataset example notebook: ../examples/submit-dataset.ipynb
        """
        current_user_id = self.current_user_id()
        assert current_user_id, 'You must be logged in to submit a dataset'

        primary_group_id = self._gqclient.get_primary_group_id()
        database_ids = [self._gqclient.map_database_to_id(db) for db in databases or []]

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
        if input_path is None:
            assert imzml_fn and ibd_fn, 'imzml_fn and ibd_fn must be supplied'
            input_path = _dataset_upload(imzml_fn, ibd_fn, self._config['dataset_upload_url'])

        graphql_response = self._gqclient.create_dataset(
            {
                'name': name,
                'inputPath': input_path,
                'description': description_json,
                'metadataJson': json.dumps(metadata),
                'databaseIds': database_ids,
                'adducts': adducts,
                'neutralLosses': neutral_losses,
                'chemMods': chem_mods,
                'ppm': ppm,
                'numPeaks': num_isotopic_peaks,
                'decoySampleSize': decoy_sample_size,
                'analysisVersion': analysis_version,
                'submitterId': current_user_id,
                'groupId': primary_group_id,
                'projectIds': project_ids,
                'isPublic': is_public,
            }
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
        analysis_version: Optional[int] = None,
        reprocess: Optional[bool] = None,
        force: bool = False,
    ):
        """Updates a dataset's metadata and/or processing settings. Only specify the fields that
        should change. All arguments should be specified as keyword arguments,
        e.g. to update a dataset's adducts:

        >>> sm.update_dataset(
        >>>     dataset_id='2018-11-07_14h15m28s',
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
        :param analysis_version:
        :param reprocess:
            None (default): Reprocess if needed
            True: Force reprocessing, even if not needed
            False: Raise an error if the changes would require reprocessing
        :param force:
            True: Allow changes to datasets that are already being processed. This should be used
            with caution, as it can cause errors or inconsistent results.
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
            input_field['is_public'] = is_public
        if ppm is not None:
            input_field['ppm'] = ppm
        if num_isotopic_peaks is not None:
            input_field['num_isotopic_peaks'] = num_isotopic_peaks
        if decoy_sample_size is not None:
            input_field['decoy_sample_size'] = decoy_sample_size
        if analysis_version is not None:
            input_field['analysis_version'] = analysis_version

        try:
            self._gqclient.update_dataset(id, input_field, reprocess or False, force)
        except GraphQLException as ex:
            if ex.type == 'reprocessing_needed' and reprocess is None:
                self._gqclient.update_dataset(id, input_field, True, force)
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

    def databases(self) -> List[MolecularDB]:
        dbs = sorted(self._gqclient.get_visible_databases(), key=lambda db: db['id'])
        return [MolecularDB(db) for db in dbs]

    def create_database(
        self, local_path: Union[str, Path], name: str, version: str, is_public: bool = False
    ) -> dict:
        return self._gqclient.create_database(local_path, name, version, is_public)

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
    'IsotopeImages',
    'OpticalImage',
    'GraphQLClient',
    'MetaspaceException',
    'DatasetNotFound',
    'GraphQLException',
    'BadRequestException',
    'InvalidResponseException',
]
