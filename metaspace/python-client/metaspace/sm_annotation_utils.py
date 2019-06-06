from concurrent.futures import ThreadPoolExecutor
import pandas as pd
import numpy as np
import requests, json, re, os, boto3, pprint
from copy import deepcopy
from io import BytesIO
from PIL import Image


def _extract_data(res):
    if not res.headers.get('Content-Type').startswith('application/json'):
        raise Exception('Wrong Content-Type: {}'.format(res.headers.get('Content-Type')))
    res_json = res.json()
    if 'data' in res_json and 'errors' not in res_json:
        return res.json()['data']
    else:
        pprint.pprint(res.json()['errors'])
        raise Exception(res.json()['errors'][0]['message'])


def get_config(host, email=None, password=None, verify_certificate=True):
    return {
        'host': host,
        'graphql_url': '{}/graphql'.format(host),
        'moldb_url': '{}/mol_db/v1'.format(host),
        'signin_url': '{}/api_auth/signin'.format(host),
        'gettoken_url': '{}/api_auth/gettoken'.format(host),
        'usr_email': email,
        'usr_pass': password,
        'verify_certificate': verify_certificate
    }


class GraphQLClient(object):
    def __init__(self, config):
        self._config = config
        self.host = self._config['host']
        self.session = requests.Session()
        self.session.verify = self._config['verify_certificate']
        self.res = self.session.post(self._config['signin_url'], params={
            "email": self._config['usr_email'],
            "password": self._config['usr_pass']
        })
        if self.res.status_code == 401:
            print('Unauthorized. Only public but not private datasets will be accessible.')
        elif self.res.status_code == 200:
            print('Authorized.')
        elif self.res.status_code != 200:
            self.res.raise_for_status()


    def query(self, query, variables={}):
        res = self.session.post(self._config['graphql_url'],
                                json={'query': query, 'variables': variables},
                                headers={'Authorization': 'Bearer ' + self.get_jwt()},
                                verify=self._config['verify_certificate'])
        return _extract_data(res)

    def get_jwt(self):
        res = self.session.get(self._config['gettoken_url'],
                               verify=self._config['verify_certificate'])
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

    def listQuery(self, field_name, query, variables={}, batch_size=50000):
        """
        Gets all results of an iterQuery as a list.
        Field name must be provided in addition to the query (e.g. 'allDatasets')
        """
        records = []
        for res in self.iterQuery(query, variables, batch_size):
            if not res[field_name]:
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
        molDBs
        adducts
        acquisitionGeometry
        metadataType
        status
        inputPath
    """

    ANNOTATION_FIELDS = """
        sumFormula
        adduct
        mz
        msmScore
        rhoSpatial
        rhoSpectral
        rhoChaos
        fdrLevel
        offSample
        offSampleProb
        dataset {
            id
            name
        }
        possibleCompounds {
            name
            information{
              url
            }
        }
        isotopeImages {
            mz
            url
            maxIntensity
        }
    """

    def getDataset(self, datasetId):
        query = """
        query datasetInfo($id: String!) {
          dataset(id: $id) {
        """ + self.DATASET_FIELDS + """
          }
        }
        """
        match = self.query(query, {'id': datasetId})['dataset']
        if not match:
            raise DatasetNotFound("search by id for {}".format(datasetId))
        else:
            return match

    def getDatasetByName(self, datasetName):
        query = """
        query datasetInfo($filter: DatasetFilter!) {
          allDatasets(filter: $filter) {
        """ + self.DATASET_FIELDS + """
          }
        }
        """
        matches = self.query(query, {'filter': {'name': datasetName}})['allDatasets']
        if not matches:
            raise DatasetNotFound("search by name for {}".format(datasetName))
        elif len(matches) > 1:
            print('Found datasets:')
            for dataset in matches:
                print(dataset['name'], 'id={}'.format(dataset['id']), '\n')
            raise Exception('More than 1 dataset were found with the same name, '
                            'please run your code with the dataset ID instead.')
        else:
            return matches[0]

    def getAnnotations(self, annotationFilter={}, datasetFilter={}):
        query = """
        query getAnnotations($filter: AnnotationFilter,
                             $dFilter: DatasetFilter,
                             $offset: Int, $limit: Int) {
          allAnnotations(
            filter: $filter,
            datasetFilter: $dFilter,
            offset: $offset,
            limit: $limit
          ) {
        """ + self.ANNOTATION_FIELDS + """
          }
        }"""
        annotFilter = deepcopy(annotationFilter)
        if 'database' not in annotFilter:
            annotFilter['database'] = "HMDB-v4"
        return self.listQuery('allAnnotations', query,
                              {'filter': annotFilter, 'dFilter': datasetFilter})

    def getDatasets(self, datasetFilter={}):
        query = """
        query getDatasets($filter: DatasetFilter,
                          $offset: Int, $limit: Int) {
          allDatasets(
            filter: $filter,
            offset: $offset,
            limit: $limit
          ) {
        """ + self.DATASET_FIELDS + """
          }
        }"""
        return self.listQuery('allDatasets', query, {'filter': datasetFilter})

    def getRawOpticalImage(self, dsid):
        query= """
            query getRawOpticalImages($datasetId: String!){ 
                rawOpticalImage(datasetId: $datasetId) 
                {
                    url, transform
                }
            }
        """
        variables = {"datasetId": dsid}
        return self.query(query, variables)

    def getRegisteredImage(self, dsid, zoom_level = 8):
        query= """
            query getRawOpticalImages($datasetId: String!, $zoom: Int){ 
                rawOpticalImage(datasetId: $datasetId) 
            }
        """
        variables = {"datasetId": dsid}
        return self.query(query, variables)

    def createDataset(self, data_path, metadata, priority=0, dsName=None,
                      isPublic=None, molDBs=None, adducts=None, dsid=None):
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
            'id': dsid,
            'input': {
                'name': dsName,
                'inputPath': data_path,
                'isPublic': isPublic,
                'molDBs': molDBs,
                'adducts': adducts,
                'submitterId': submitter_id,
                'metadataJson': metadata
            }
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

    def update_dataset(self, ds_id, molDBs=None, adducts=None, reprocess=False, force=False, priority=1):
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
        if molDBs:
            input_field['molDBs'] = molDBs
        if adducts:
            input_field['adducts'] = adducts
        variables = {
            'id': ds_id,
            'input': input_field,
            'priority': priority,
            'reprocess': reprocess,
            'force': force,
        }

        return self.query(query, variables)

    def get_molecular_databases(self, names=None):
        query = '''{
          molecularDatabases {
            id name version
          }
        }'''
        resp = self.query(query)
        if 'molecularDatabases' not in resp:
            raise Exception('GraphQL error: {}'.format(resp))
        mol_dbs = resp['molecularDatabases']
        if not names:
            return mol_dbs
        else:
            return [d for d in mol_dbs if d['name'] in names]


class MolDBClient:
    def __init__(self, config):
        self._url = config['moldb_url']
        self._mol_formula_lists = {}
        self._session = requests.session()

    def getDatabase(self, name, version=None):
        url = self._url + '/databases?name={}'.format(name)
        if version:
            url += '&version=' + version
        db_list = _extract_data(self._session.get(url))
        return MolecularDatabase(db_list[0], self)

    def getDatabaseList(self):
        url = self._url + '/databases'
        db_list = _extract_data(self._session.get(url))
        return [MolecularDatabase(db, self) for db in db_list]

    def getMolFormulaList(self, dbId):
        if dbId in self._mol_formula_lists:
            return self._mol_formula_lists[dbId]
        url = self._url + '/databases/{}/sfs'.format(dbId)
        self._mol_formula_lists[dbId] = _extract_data(self._session.get(url))
        return self._mol_formula_lists[dbId]

    def getMolFormulaNames(self, dbId, molFormula):
        url = '{}/databases/{}/molecules?sf={}'.format(
            self._url, dbId, molFormula
        ) + '&limit=100&fields=mol_name'
        return [m['mol_name'] for m in _extract_data(self._session.get(url))]

    def getMolFormulaIds(self, dbId, molFormula):
        url = '{}/databases/{}/molecules?sf={}'.format(
            self._url, dbId, molFormula
        ) + '&limit=100&fields=mol_id'
        return [m['mol_id'] for m in _extract_data(self._session.get(url))]

    def get_molecules(self, db_id, fields, limit=100):
        """ Fetch molecules from database

        Args:
            db_id: int
            fields: list[string]
                sf, mol_id, mol_name
            limit: int

        Return:
            list[dict]
        """
        url = f'{self._url}/databases/{db_id}/molecules?'
        url += f'limit={limit}&fields={",".join(fields)}'
        return [m for m in _extract_data(self._session.get(url))]

    def clearCache(self):
        self._mol_formula_lists = {}


def ion(r):
    from pyMSpec.pyisocalc.tools import normalise_sf
    return (r.ds_id, normalise_sf(r.sf), r.adduct, 1)

class IsotopeImages(object):
    def __init__(self, images, sf, adduct, centroids, urls):
        self._images = images
        self._sf = sf
        self._adduct = adduct
        self._centroids = centroids
        self._urls = urls

    def __getitem__(self, index):
        return self._images[index]

    def __repr__(self):
        return "IsotopeImages({}{})".format(self._sf, self._adduct)

    def __len__(self):
        return len(self._images)

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
        self._images = [image, ]
        self._transforms = [registered_image,]
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
            resample=Image.NEAREST
        )
        return im_t

    def to_ion_image(self, index, ion_image_shape):
        return self._transform(Image.fromarray(self[index]), self._transforms[index], (ion_image_shape[1], ion_image_shape[0]))

    def ion_image_to_optical(self, ion_image, index=0):
        return self._transform(self._to_rgb(ion_image), self._itransforms[index], (self._images[index].shape[1], self._images[index].shape[0]))

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
        self._gqclient = gqclient
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

    def annotations(self, fdr=0.1, database=None, return_vals = ('sumFormula', 'adduct')):
        annotationFilter = {'fdrLevel': fdr}
        if database:
            annotationFilter['database'] = database
        datasetFilter = {'ids': self.id}

        records = self._gqclient.getAnnotations(annotationFilter, datasetFilter)
        return [list(r[val] for val in return_vals) for r in records]

    def results(self, database=None):
        annotationFilter = {}
        if database:
            annotationFilter['database'] = database
        records = self._gqclient.getAnnotations(annotationFilter, {'ids': self.id})
        df = pd.io.json.json_normalize(records)
        return pd.DataFrame(dict(
            formula=df['sumFormula'],
            adduct=df['adduct'],
            msm=df['msmScore'],
            moc=df['rhoChaos'],
            rhoSpatial=df['rhoSpatial'],
            rhoSpectral=df['rhoSpectral'],
            fdr=df['fdrLevel'],
            mz=df['mz'],
            moleculeNames=[[item['name'] for item in lst] for lst in df['possibleCompounds']],
            moleculeIds=[[item['information'][0]['url'].rsplit("/")[-1] for item in lst] for lst in df['possibleCompounds']],
            intensity=[img[0]['maxIntensity'] for img in df['isotopeImages']]
        )).set_index(['formula', 'adduct'])

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
        return self._config['isotope_generation']['charge']['polarity']

    @property
    def databases(self):
        return self._config['databases']

    @property
    def database(self):
        return self.databases[0]

    @property
    def status(self):
        return self._info['status']

    @property
    def _baseurl(self):
        return self._gqclient.host

    def isotope_images(self, sf, adduct):
        records = self._gqclient.getAnnotations(
            dict(sumFormula=sf, adduct=adduct, database=None),
            dict(ids=self.id)
        )

        import matplotlib.image as mpimg

        def fetchImage(url):
            if not url:
                return None
            url = self._baseurl + url
            im = mpimg.imread(BytesIO(self._session.get(url).content))
            mask = im[:, :, 3]
            data = im[:, :, 0]
            data[mask == 0] = 0
            assert data.max() <= 1
            return data

        images = []
        image_metadata = None
        if records:
            image_metadata = records[0]['isotopeImages']
            images = [fetchImage(r.get('url')) for r in image_metadata]

        non_empty_images = [i for i in images if i is not None]
        shape = non_empty_images[0].shape
        for i in range(len(images)):
            if images[i] is None:
                images[i] = np.zeros(shape, dtype=non_empty_images[0].dtype)
            else:
                images[i] *= image_metadata[i]['maxIntensity']

        return IsotopeImages(images, sf, adduct, [r['mz'] for r in image_metadata], [r['url'] for r in image_metadata])

    def all_annotation_images(self, fdr=0.1, database=None):
        with ThreadPoolExecutor() as pool:
            images = [img for img in pool.map(lambda row: self.isotope_images(*row),
                                              self.annotations(fdr=fdr, database=database))]
        return images

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


class SMInstance(object):
    def __init__(self, host='https://metaspace2020.eu', verify_certificate=True):
        self._config = get_config(host=host, verify_certificate=verify_certificate)
        if not verify_certificate:
            import warnings
            from urllib3.exceptions import InsecureRequestWarning
            warnings.filterwarnings('ignore', category=InsecureRequestWarning)
        self.reconnect()

    def __repr__(self):
        return "SMInstance({})".format(self._config['graphql_url'])

    def login(self, email, password):
        self._config['usr_email'] = email
        self._config['usr_pass'] = password
        self.reconnect()
        return self._gqclient.res.status_code == 200

    def reconnect(self):
        self._gqclient = GraphQLClient(self._config)
        self._es_client = None
        self._moldb_client = None

        if self._config['moldb_url']:
            self._moldb_client = MolDBClient(self._config)

        es_config = self._config.get('elasticsearch', None)
        if es_config:
            from elasticsearch import Elasticsearch
            self._es_host = es_config['host']
            self._es_port = es_config['port']
            self._es_index = es_config['index']
            self._es_user = es_config.get('user', '')
            self._es_secret = es_config.get('password', '')
            self._es_client = Elasticsearch(
                hosts=['{}:{}'.format(self._es_host, self._es_port), ],
                http_auth=(self._es_user, self._es_secret),
                index=self._es_index
            )

    def dataset(self, name=None, id=None):
        if id:
            return SMDataset(self._gqclient.getDataset(id), self._gqclient)
        elif name:
            return SMDataset(self._gqclient.getDatasetByName(name), self._gqclient)
        else:
            raise Exception("either name or id must be provided")

    def datasets(self, nameMask='', idMask=''):
        if not nameMask == '':
            return [
                SMDataset(info, self._gqclient)
                for info in self._gqclient.getDatasets(dict(name=nameMask))
            ]
        else:
            return [
                SMDataset(info, self._gqclient)
                for info in self._gqclient.getDatasets(dict(ids="|".join(idMask)))
            ]

    def all_adducts(self):
        raise NYI

    def database(self, name, version=None):
        assert self._moldb_client, 'provide moldb_url in the config'
        return self._moldb_client.getDatabase(name, version)

    def databases(self):
        assert self._moldb_client, 'provide moldb_url in the config'
        return self._moldb_client.getDatabaseList()

    def metadata(self, datasets):
        """
        Pandas dataframe for a subset of datasets
        where rows are flattened metadata JSON objects
        """
        df = pd.io.json.json_normalize([d.metadata.json for d in datasets])
        df.index = [d.name for d in datasets]
        return df

    def get_annotations(self, fdr=0.1, db_name="HMDB-v4", datasetFilter = {}):
        """
        Returns: a table of booleans indicating which ions were annotated in a
        particular dataset at the specified fdr.
        Only returns datasets with at least one anntotation at the given FDR level.
        Use in conjunction with get_metadata() to get a full dataset list.
        :param fdr: fdr level to export annotations at
        :param db_name: database to search against
        :return: pandas dataframe indexed by dataset ids,
                 with multi-index adduct / molecular formula on columns
        """
        records = self._gqclient.getAnnotations(
            annotationFilter = {'database': db_name, 'fdrLevel': fdr},
            datasetFilter = datasetFilter
            )
        df = pd.io.json.json_normalize(records)
        return pd.DataFrame(dict(
            formula=df['sumFormula'],
            adduct=df['adduct'],
            msm=df['msmScore'],
            moc=df['rhoChaos'],
            rhoSpatial=df['rhoSpatial'],
            rhoSpectral=df['rhoSpectral'],
            fdr=df['fdrLevel'],
            mz=df['mz'],
            dataset_id = df['dataset.id'],
            dataset_name = df['dataset.name'],
            moleculeNames=[[item['name'] for item in lst] for lst in df['possibleCompounds']]

        ))

        records = self._gqclient.getAnnotations(dict(database=db_name, fdrLevel=fdr))
        results = pd.io.json.json_normalize(records)
        results = pd.DataFrame({
            'sf': results['sumFormula'],
            'adduct': results['adduct'],
            'ds_id': results['dataset.id']
        })
        annotations = pd.DataFrame.pivot_table(
            pd.DataFrame.from_records([ion(r) for r in results.itertuples()]),
            index=0, columns=[2, 1], values=3
        ).notnull()
        return annotations

    def get_metadata(self, datasetFilter={}):
        datasets = self._gqclient.getDatasets(datasetFilter=datasetFilter)
        df = pd.concat([
            pd.DataFrame(pd.io.json.json_normalize(json.loads(dataset['metadataJson'])))
            for dataset in datasets ])
        df.index = [dataset['id'] for dataset in datasets]
        return df
        #return pd.DataFrame.from_records([pd.io.json.json_normalize(json.loads(dataset['metadataJson'])) for dataset in datasets])

    def _get_tables1(self, dataset, sf_adduct_pairs, fields, db_name):
        results = dataset.results(database=db_name).reset_index()
        results['sf_adduct'] = results['formula'] + results['adduct']
        query = [sf + adduct for sf, adduct in sf_adduct_pairs]
        results = results[results['sf_adduct'].isin(query)]
        d = {}
        fill_values = {'fdr': 1.0, 'msm': 0.0}
        for f in fields:
            columns = dict(ds_name=dataset.name, formula=results['formula'], adduct=results['adduct'])
            columns[f] = results[f]
            df = pd.DataFrame(columns)
            d[f] = df.pivot_table(f, index=['ds_name'], columns=['formula', 'adduct'],
                                  fill_value=fill_values.get(f, 0.0))
        return d

    # the functionality below uses ElasticSearch heavily and cannot be replaced with GraphQL
    # at the moment (aggregations, long lists of matching terms)

    def top_hits(self, datasets, adduct=None, size=100):
        """
        Returns (sum formula, adduct) pairs with highest average MSM scores
        across multiple datasets. Looks for all adducts by default
        """
        assert self._es_client, "You must provide ElasticSearch connection settings!"

        from elasticsearch_dsl import Search
        s = Search(using=self._es_client, index=self._es_index)            .filter('terms', ds_name=[d.name for d in datasets])

        if adduct is not None:
            s = s.filter('term', adduct=adduct)

        s.aggs.bucket('per_sf_adduct', 'terms',
                      field='sf_adduct', order={'msm_sum': 'desc'}, size=size)\
            .metric('msm_sum', 'sum', field='msm')

        buckets = s.execute().aggregations.per_sf_adduct.buckets
        return [re.match(r'(.*?)([+-].*)', res.key).groups() for res in buckets]

    def msm_scores(self, datasets, sf_adduct_pairs, db_name="HMDB-v4"):
        """
        Returns a dataframe of MSM scores for multiple datasets and (sum formula, adduct) pairs.
        """
        return self.get_tables(datasets, sf_adduct_pairs, ['msm'], db_name)['msm']

    def get_tables(self, datasets, sf_adduct_pairs, fields=['msm', 'fdr'], db_name="HMDB-v4"):
        """
        Returns dataframe-valued dictionaries of MSM scores
        for multiple datasets and (sum formula, adduct) pairs.
        """
        assert fields, "list of fields can't be empty"
        assert datasets, "list of datasets can't be empty"

        # special case: if there's only one dataset, use GraphQL
        if len(datasets) == 1 and not self._es_client:
            return self._get_tables1(datasets[0], sf_adduct_pairs, fields, db_name)
        #TODO: use graphql for all queries
        assert self._es_client, "You must provide ElasticSearch connection settings!"
        from elasticsearch_dsl import Search
        fill_values = {'fdr': 1.0, 'msm': 0.0}
        s = Search(using=self._es_client, index=self._es_index)\
            .filter('terms', ds_name=[d.name for d in datasets])\
            .filter('terms', sf_adduct=[x[0] + x[1] for x in sf_adduct_pairs])\
            .filter('term', db_name=db_name)\
            .fields(['sf', 'adduct', 'ds_name'] + fields)
        results = list(s.scan())
        d = {}
        for f in fields:
            records = ((r.ds_name, r.sf, r.adduct, r[f]) for r in results)
            d[f] = pd.DataFrame.from_records(records, columns=['ds_name', 'sf', 'adduct', f])\
                               .pivot_table(f, index=['ds_name'], columns=['sf', 'adduct'],
                                            fill_value=fill_values.get(f, 0.0))
        return d

    def submit_dataset(self, imzml_fn, ibd_fn, metadata, dsid=None, folder_uuid = None, dsName=None,
                       isPublic=None, molDBs=None, adducts=None, s3bucket=None, priority=0):
        """
        Submit a dataset for processing on the SM Instance
        :param imzml_fn: file path to imzml
        :param ibd_fn: file path to ibd
        :param metadata: a properly formatted metadata json string
        :param s3bucket: this should be a bucket that both the user has write permission to and METASPACE can access 
        :param folder_uuid: a unique key for the dataset
        :return: 
        """
        s3 = boto3.client('s3')
        buckets = s3.list_buckets()
        if not s3bucket in [b['Name'] for b in buckets['Buckets']]:
            s3.create_bucket(Bucket=s3bucket, CreateBucketConfiguration={
                                                    'LocationConstraint': 'eu-west-1'})
        if not folder_uuid:
            import uuid
            folder_uuid = str(uuid.uuid4())
        for fn in [imzml_fn, ibd_fn]:
            key = "{}/{}".format(folder_uuid, os.path.split(fn)[1])
            s3.upload_file(fn, s3bucket, key)
        folder = "s3a://" + s3bucket + "/" + folder_uuid
        return self._gqclient.createDataset(folder, metadata, priority, dsName, isPublic, molDBs, adducts, dsid=dsid)

    def update_dataset_dbs(self, datasetID, molDBs, adducts, priority):
        return self._gqclient.update_dataset(datasetID, molDBs, adducts, priority)

    def delete_dataset(self, ds_id, **kwargs):
        return self._gqclient.delete_dataset(ds_id, **kwargs)


class MolecularDatabase:
    def __init__(self, metadata, client):
        self._metadata = metadata
        self._id = self._metadata['id']
        self._client = client

    @property
    def name(self):
        return self._metadata['name']

    @property
    def version(self):
        return self._metadata['version']

    def __repr__(self):
        return "MolDB({} [{}])".format(self.name, self.version)

    def sum_formulas(self):
        return self._client.getMolFormulaList(self._id)

    def names(self, sum_formula):
        return self._client.getMolFormulaNames(self._id, sum_formula)

    def ids(self, sum_formula):
        return self._client.getMolFormulaIds(self._id, sum_formula)

    def molecules(self, limit=100):
        return  self._client.get_molecules(self._id, ['sf', 'mol_id', 'mol_name'], limit=limit)


def plot_diff(ref_df, dist_df, t='', xlabel='', ylabel='', col='msm'):
    import plotly.graph_objs as go
    from plotly.offline import iplot
    plot_df = dist_df.join(ref_df, rsuffix='_ref', how='inner').dropna()

    text_tmpl = '{}{}<br>X: moc={:.3f} spat={:.3f} spec={:.3f}'\
                '<br>Y: moc={:.3f} spat={:.3f} spec={:.3f}'

    traces = []
    adducts = plot_df.index.get_level_values('adduct').unique()
    for adduct in adducts:
        df = plot_df.xs(adduct, level='adduct')
        txt = df.reset_index().apply(
            lambda r: text_tmpl.format(
                r.sf, adduct, r.moc_ref, r.spat_ref, r.spec_ref, r.moc, r.spat, r.spec
            ), axis=1)

        if df.empty:
            continue

        traces.append(go.Scatter(
            x=df['{}_ref'.format(col)],
            y=df['{}'.format(col)],
            text=txt,
            mode='markers',
            name=adduct
        ))

    data = go.Data(traces)
    fig = go.Figure(data=data, layout=go.Layout(
        autosize=False,
        height=500,
        hovermode='closest',
        title=t+' \'{}\' values'.format(col),
        width=500,
        xaxis=go.XAxis(
            autorange=False,
            range=[-0.05675070028979684, 1.0323925590539844],  # what the fuck is this?
            title=xlabel,
            type='linear'
        ),
        yaxis=go.YAxis(
            autorange=False,
            range=[-0.0015978995361995152, 1.0312345837176764],  # what the fuck is this?
            title=ylabel,
            type='linear'
        )
    ))
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