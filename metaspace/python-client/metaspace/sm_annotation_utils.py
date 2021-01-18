import json
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
from typing import Optional, List, Iterable, Dict, Union, Tuple

import numpy as np
import pandas as pd
import requests
from PIL import Image

from metaspace.image_processing import clip_hotspots

try:
    from typing import TypedDict  # Requires Python 3.8
except ImportError:
    TypedDict = dict

try:
    from pandas import json_normalize  # Only in Pandas 1.0.0+
except ImportError:
    from pandas.io.json import json_normalize  # Logs DeprecationWarning if used in Pandas 1.0.0+


DEFAULT_DATABASE = ('HMDB', 'v4')


class DatasetDownloadLicense(TypedDict):
    code: str
    name: str
    link: Optional[str]


class DatasetDownloadContributor(TypedDict):
    name: Optional[str]
    institution: Optional[str]


class DatasetDownloadFile(TypedDict):
    filename: str
    link: str


class DatasetDownload(TypedDict):
    license: DatasetDownloadLicense
    contributors: List[DatasetDownloadContributor]
    files: List[DatasetDownloadFile]


class MetaspaceException(Exception):
    pass


class GraphQLException(MetaspaceException):
    def __init__(self, json, message):
        super().__init__(message)
        self.json = json
        self.message = message


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
        'companion_url': f'{host}/database_upload',
        'usr_email': email,
        'usr_pass': password,
        'usr_api_key': api_key,
        'verify_certificate': verify_certificate,
    }


def multipart_upload(local_path, companion_url):
    def send_request(url, method='GET', json=None, data=None, return_headers=False):
        if method == 'POST':
            resp = requests.post(url, data=data, json=json)
        elif method == 'PUT':
            resp = requests.put(url, data=data, json=json)
        else:
            resp = requests.get(url)
        resp.raise_for_status()
        return resp.json() if not return_headers else resp.headers

    def init_multipart_upload(filename, file_type='text/csv'):
        url = companion_url + '/s3/multipart'
        data = {
            'filename': filename,
            'type': file_type,
            'metadata': {'name': filename, 'type': file_type},
        }
        resp_data = send_request(url, 'POST', json=data)
        return resp_data['key'], resp_data['uploadId']

    def sign_part_upload(key, upload_id, part):
        query = urllib.parse.urlencode({'key': key})
        url = f'{companion_url}/s3/multipart/{upload_id}/{part}?{query}'
        resp_data = send_request(url)
        return resp_data['url']

    def upload_part(presigned_url, data):
        resp_data = send_request(presigned_url, 'PUT', data=data, return_headers=True)
        return resp_data['ETag']

    def complete_multipart_upload(key, upload_id, etags):
        query = urllib.parse.urlencode({'key': key})
        url = f'{companion_url}/s3/multipart/{upload_id}/complete?{query}'
        data = {'parts': [{'PartNumber': part, 'ETag': etag} for part, etag in etags]}
        resp_data = send_request(url, 'POST', json=data)
        location = urllib.parse.unquote(resp_data['location'])
        (bucket,) = re.findall(r'https://([^.]+)', location)
        return f's3://{bucket}/{key}'

    key, upload_id = init_multipart_upload(Path(local_path).name)

    PART_SIZE = 5 * 1024 ** 2
    etags = []
    part = 0
    with open(local_path, 'rb') as f:
        while True:
            file_data = f.read(PART_SIZE)
            if not file_data:
                break

            part += 1
            print(f'Uploading {part} part of {local_path} file...')
            presigned_url = sign_part_upload(key, upload_id, part)
            etag = upload_part(presigned_url, file_data)
            etags.append((part, etag))

    s3_path = complete_multipart_upload(key, upload_id, etags)
    return s3_path


class GraphQLClient(object):
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

    def get_submitter_id(self):
        query = """
        query {
          currentUser {
            id
          }
        }
        """
        return self.query(query)['currentUser']['id']

    def get_primary_group_id(self):
        query = """
            query {
              currentUser {
                primaryGroup { group { id } }
              }
            }
        """
        return self.query(query)['currentUser']['primaryGroup'].get('group', {}).get('id', None)

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
            name
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
        query = """
            {
              allMolecularDBs {
                id name version isPublic archived default
              }
            }
        """
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

    def create_dataset(
        self,
        data_path,
        metadata,
        ds_name=None,
        is_public=None,
        databases=None,
        adducts=None,
        ppm=None,
        ds_id=None,
    ):
        submitter_id = self.get_submitter_id()
        query = """
            mutation createDataset($id: String, $input: DatasetCreateInput!, $priority: Int) {
                createDataset(
                  id: $id,
                  input: $input,
                  priority: $priority
                )
            }
        """
        variables = {
            'id': ds_id,
            'input': {
                'name': ds_name,
                'inputPath': data_path,
                'isPublic': is_public,
                'databaseIds': databases and [self.map_database_to_id(db) for db in databases],
                'adducts': adducts,
                'ppm': ppm,
                'submitterId': submitter_id,
                'metadataJson': metadata,
            },
        }
        return self.query(query, variables)

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
        name=None,
        databases=None,
        adducts=None,
        ppm=None,
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
        input_field = {}
        if name:
            input_field['name'] = name

        if databases:
            input_field['databaseIds'] = [self.map_database_to_id(db) for db in databases]

        if adducts:
            input_field['adducts'] = adducts
        if ppm:
            input_field['ppm'] = ppm
        variables = {
            'id': ds_id,
            'input': input_field,
            'priority': priority,
            'reprocess': reprocess,
            'force': force,
        }

        return self.query(query, variables)

    def create_database(
        self, local_path: Union[str, Path], name: str, version: str, is_public: bool = False
    ) -> dict:
        s3_path = multipart_upload(local_path, self._config['companion_url'])

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


def ion(r):
    from pyMSpec.pyisocalc.tools import normalise_sf

    return (r.ds_id, normalise_sf(r.sf), r.adduct, 1)


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


class Metadata(object):
    def __init__(self, json_metadata):
        self._json = json_metadata

    @property
    def json(self):
        return self._json


NYI = Exception("NOT IMPLEMENTED YET")


class SMDataset(object):
    def __init__(self, _info, gqclient):
        self._info = _info
        self._gqclient: GraphQLClient = gqclient
        self._config = json.loads(self._info['configJson'])
        self._metadata = Metadata(self._info['metadataJson'])
        self._session = requests.session()

    @property
    def id(self):
        return self._info['id']

    @property
    def name(self):
        return self._info['name']

    @property
    def s3dir(self):
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
            .drop(columns=['possibleCompounds', 'dataset.id', 'dataset.name', 'offSampleProb',])
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
    def metadata(self):
        return self._metadata

    @property
    def config(self):
        return self._config

    @property
    def adducts(self):
        return self._config['isotope_generation']['adducts']

    @property
    def polarity(self):
        return 'Positive' if self._config['isotope_generation']['charge'] > 0 else 'Negative'

    @property
    def database_details(self):
        return self._info['databases']

    @property
    def databases(self):
        """DEPRECATED. Use 'databases_details' instead."""
        return [d['name'] for d in self.database_details]

    @property
    def database(self):
        """DEPRECATED. Use 'databases_details' instead."""
        return self.databases[0]

    @property
    def status(self):
        return self._info['status']

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
            url = self._baseurl + url
            try:
                im = mpimg.imread(BytesIO(self._session.get(url).content))
            except:
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

        if scale_intensity:
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
        scale_intensity: bool = True,
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
            hotspot_clipping:   When True, apply hotspot clipping. Recommended if the images will
                be used for visualisation. This is required to get ion images that match the
                METASPACE website
            annotation_filter: Additional filters passed to `SMDataset.annotations`.
        Returns:
            list of isotope images
        """
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
            return list(pool.map(get_annotation_images, annotations,))

    def optical_images(self):
        def fetch_image(url):
            from PIL import Image

            if not url:
                return None
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


class MolecularDB:
    def __init__(self, info, gqclient):
        self._info = info
        self._gqclient = gqclient

    @property
    def id(self):
        return self._info['id']

    @property
    def name(self):
        return self._info['name']

    @property
    def version(self):
        return self._info['version']

    @property
    def is_public(self):
        return self._info['isPublic']

    @property
    def archived(self):
        return self._info['archived']

    def __repr__(self):
        return f'<{self.id}:{self.name}:{self.version}>'


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
        assert (
            email and password
        ) or api_key, 'Either email and password, or api_key must be provided'
        self._config['usr_email'] = email
        self._config['usr_pass'] = password
        self._config['usr_api_key'] = api_key
        self.reconnect()
        assert self._gqclient.logged_in, 'Login failed'

    def reconnect(self):
        self._gqclient = GraphQLClient(self._config)
        self._es_client = None

    def logged_in(self):
        return self._gqclient.logged_in

    @property
    def projects(self):
        from metaspace.projects_client import ProjectsClient

        return ProjectsClient(self._gqclient)

    def dataset(self, name=None, id=None) -> SMDataset:
        if id:
            return SMDataset(self._gqclient.getDataset(id), self._gqclient)
        elif name:
            return SMDataset(self._gqclient.getDatasetByName(name), self._gqclient)
        else:
            raise Exception("either name or id must be provided")

    def datasets(self, nameMask='', idMask='', **kwargs) -> List[SMDataset]:
        datasetFilter = kwargs.copy()
        if nameMask != '':
            datasetFilter['name'] = nameMask
        if idMask != '':
            datasetFilter['ids'] = idMask if isinstance(idMask, str) else "|".join(idMask)

        return [
            SMDataset(info, self._gqclient) for info in self._gqclient.getDatasets(datasetFilter)
        ]

    def all_adducts(self):
        raise NYI

    def metadata(self, datasets):
        """
        Pandas dataframe for a subset of datasets
        where rows are flattened metadata JSON objects
        """
        df = json_normalize([d.metadata.json for d in datasets])
        df.index = [d.name for d in datasets]
        return df

    def get_annotations(self, fdr=0.1, db_name="HMDB-v4", datasetFilter={}):
        """
        DEPRECATED
        This function does not work as previously described, and is kept only for backwards compatibility.
        Use sm.dataset(id='...').results() or sm.dataset(id='...').annotations() instead.
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
        imzml_fn,
        ibd_fn,
        metadata,
        dsid=None,
        folder_uuid=None,
        dsName=None,
        isPublic=None,
        molDBs=None,
        adducts=None,
        s3bucket=None,
        priority=0,
    ):
        """DEPRECATED. Submit a dataset for processing on the SM Instance
        :param imzml_fn: file path to imzml
        :param ibd_fn: file path to ibd
        :param metadata: a properly formatted metadata json string
        :param s3bucket: this should be a bucket that both the user has write permission to and METASPACE can access
        :param folder_uuid: a unique key for the dataset
        :return:
        """
        try:
            import boto3
        except ImportError:
            raise ImportError('Please install boto3 to use the submit_dataset function')

        s3 = boto3.client('s3')
        buckets = s3.list_buckets()
        if not s3bucket in [b['Name'] for b in buckets['Buckets']]:
            s3.create_bucket(
                Bucket=s3bucket, CreateBucketConfiguration={'LocationConstraint': 'eu-west-1'}
            )
        if not folder_uuid:
            import uuid

            folder_uuid = str(uuid.uuid4())
        for fn in [imzml_fn, ibd_fn]:
            key = "{}/{}".format(folder_uuid, os.path.split(fn)[1])
            s3.upload_file(fn, s3bucket, key)
        folder = "s3a://" + s3bucket + "/" + folder_uuid
        return self._gqclient.create_dataset(
            data_path=folder,
            metadata=metadata,
            ds_name=dsName,
            is_public=isPublic,
            databases=molDBs,
            adducts=adducts,
            ds_id=dsid,
        )

    def submit_dataset_v2(
        self,
        imzml_fn: str,
        ibd_fn: str,
        ds_name: str,
        metadata: str,
        s3_bucket,
        is_public: bool = None,
        moldbs: Union[List[str], List[int]] = None,
        adducts: List[str] = None,
        priority: int = 0,
    ):
        """Submit a dataset for processing in Metaspace.

        Args:
            imzml_fn: Imzml file path.
            ibd_fn: Ibd file path.
            ds_name: Dataset name.
            metadata: Properly formatted metadata json string.
            s3_bucket: boto3 s3 bucket object, both the user has write permission to
                and METASPACE can access.
            is_public: Make dataset public.
            moldbs: List of databases.
            adducts: List of adducts.

        Returns:
            Request status.
        """
        import uuid

        dataset_key = str(uuid.uuid4())
        for fn in [imzml_fn, ibd_fn]:
            file_key = f'{dataset_key}/{Path(fn).name}'
            s3_bucket.upload_file(fn, file_key)
        return self._gqclient.create_dataset(
            data_path=f's3a://{s3_bucket.name}/{dataset_key}',
            metadata=metadata,
            ds_name=ds_name,
            is_public=is_public,
            databases=moldbs,
            adducts=adducts,
        )

    def update_dataset_dbs(self, datasetID, molDBs=None, adducts=None, priority=1):
        return self._gqclient.update_dataset(
            ds_id=datasetID, databases=molDBs, adducts=adducts, reprocess=True, priority=priority
        )

    def reprocess_dataset(self, dataset_id, force=False):
        return self._gqclient.update_dataset(ds_id=dataset_id, reprocess=True, force=force)

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

        return db_match and MolecularDB(db_match, self._gqclient)

    def databases(self) -> List[MolecularDB]:
        return [MolecularDB(db, self._gqclient) for db in self._gqclient.get_visible_databases()]

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
