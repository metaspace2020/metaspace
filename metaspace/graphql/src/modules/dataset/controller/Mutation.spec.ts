import config from '../../../utils/config';
import * as _ from 'lodash';

import {processingSettingsChanged} from './Mutation';
import {
  adminContext,
  doQuery, onAfterAll, onAfterEach,
  onBeforeAll, onBeforeEach, setupTestUsers, testEntityManager,
} from '../../../tests/graphqlTestEnvironment';
import {PublicationStatusOptions as PSO} from '../../project/PublicationStatusOptions';
import {
  createTestDataset,
  createTestDatasetProject,
  createTestProject
} from '../../../tests/testDataCreation';
import {Dataset as DatasetType} from '../../../binding';
import {Dataset as DatasetModel, DatasetProject as DatasetProjectModel} from '../model';
import {EngineDataset, EngineDataset as EngineDatasetModel} from '../../engine/model';
import * as _mockSmApi from '../../../utils/smAPI';

jest.mock('../../../utils/smAPI');
const mockSmApi = _mockSmApi as jest.Mocked<typeof _mockSmApi>;


describe('processingSettingsChanged', () => {
  const metadata = {
      "MS_Analysis": {
        "Analyzer": "FTICR",
        "Polarity": "Positive",
        "Ionisation_Source": "MALDI",
        "Detector_Resolving_Power": {
          "mz": 400,
          "Resolving_Power": 140000
        }
      },
      "Submitted_By": {
        "Submitter": {
          "Email": "user@example.com",
          "Surname": "Surname",
          "First_Name": "Name"
        },
        "Institution": "Genentech",
        "Principal_Investigator": {
          "Email": "pi@example.com",
          "Surname": "Surname",
          "First_Name": "Name"
        }
      },
      "Sample_Information": {
        "Organism": "Mus musculus (mouse)",
        "Condition": "Dosed vs. vehicle",
        "Organism_Part": "EMT6 Tumors",
        "Sample_Growth_Conditions": "NA"
      },
      "Sample_Preparation": {
        "MALDI_Matrix": "2,5-dihydroxybenzoic acid (DHB)",
        "Tissue_Modification": "N/A",
        "Sample_Stabilisation": "Fresh frozen",
        "MALDI_Matrix_Application": "TM sprayer"
      },
      "Additional_Information": {
        "Publication_DOI": "NA",
        "Expected_Molecules_Freetext": "tryptophan pathway",
        "Sample_Preparation_Freetext": "NA",
        "Additional_Information_Freetext": "NA"
      }
    },
    dsConfig = {
      "image_generation": {
        "q": 99,
        "do_preprocessing": false,
        "nlevels": 30,
        "ppm": 3
      },
      "isotope_generation": {
        "adducts": ["+H", "+Na", "+K"],
        "charge": {
          "polarity": "+",
          "n_charges": 1
        },
        "isocalc_sigma": 0.000619,
        "isocalc_pts_per_mz": 8078
      },
      "databases": config.defaults.moldb_names
    },
    ds = {
      config: dsConfig,
      metadata: metadata,
    } as EngineDataset;

  it('Reprocessing needed when database list changed', () => {
    const updDS = {
      molDBs: [...(ds.config as any).databases, 'ChEBI'],
      metadata: ds.metadata,
    };

    const {newDB} = processingSettingsChanged(ds, updDS);

    expect(newDB).toBe(true);
  });

  it('Drop reprocessing needed when instrument settings changed', () => {
    const updDS = {
      molDBs: (ds.config as any).databases,
      metadata: _.defaultsDeep({ MS_Analysis: { Detector_Resolving_Power: { mz: 100 }}}, ds.metadata),
    };

    const { procSettingsUpd } = processingSettingsChanged(ds, updDS);

    expect(procSettingsUpd).toBe(true);
  });

  it('Reprocessing not needed when just metadata changed', () => {
    const updDS = {
      metadata: _.defaultsDeep({
        Sample_Preparation: { MALDI_Matrix: 'New matrix' },
        MS_Analysis: { ionisationSource: 'DESI' },
        Sample_Information: { Organism: 'New organism' },
      }, ds.metadata),
      name: 'New DS name'
    };

    const {newDB, procSettingsUpd} = processingSettingsChanged(ds, updDS);

    expect(newDB).toBe(false);
    expect(procSettingsUpd).toBe(false);
  });
});

describe('Dataset delete/update/hide not allowed for published ones', () => {
  beforeAll(onBeforeAll);
  afterAll(onAfterAll);
  beforeEach(async () => {
    await onBeforeEach();
    await setupTestUsers();
  });
  afterEach(onAfterEach);

  const deleteDataset = `mutation ($datasetId: String!) {
      deleteDataset(id: $datasetId)
    }`,
    updateDataset = `mutation ($datasetId: String!, $input: DatasetUpdateInput!) {
      updateDataset(id: $datasetId, input: $input)
    }`;

  it.each([PSO.UNDER_REVIEW, PSO.PUBLISHED])(
    'Not allowed to delete dataset in project in %s status', async (status) => {
    const datasetProject = await createTestDatasetProject(status);

    const promise = doQuery<DatasetType>(deleteDataset, { datasetId: datasetProject.datasetId });

    await expect(promise).rejects.toThrowError(/Cannot modify dataset/);
    await testEntityManager.findOneOrFail(DatasetModel, datasetProject.datasetId);
  });

  it('Not allowed to make published dataset private', async () => {
    const datasetProject = await createTestDatasetProject(PSO.PUBLISHED);

    const promise = doQuery<DatasetType>(
      updateDataset,{ datasetId: datasetProject.datasetId, input: { isPublic: false }}
    );

    await expect(promise).rejects.toThrowError(/Cannot modify dataset/);
    const { isPublic } = await testEntityManager.findOneOrFail(EngineDatasetModel, datasetProject.datasetId);
    expect(isPublic).toBe(true);
  });

  it.each([PSO.UNPUBLISHED, PSO.UNDER_REVIEW, PSO.PUBLISHED])(
      'Allowed to add datasets to project in %s status', async (status) => {
    const project = await createTestProject({ publicationStatus: status });
    const dataset = await createTestDataset();

    mockSmApi.smAPIRequest.mockReturnValue('');

    await doQuery<DatasetType>(updateDataset, { datasetId: dataset.id, input: { projectIds: [project.id] }});

    const updDataset = await testEntityManager.findOneOrFail(
      DatasetModel, dataset.id, {relations: ['datasetProjects']}
    );
    expect(updDataset.datasetProjects).toEqual(
      expect.arrayContaining([expect.objectContaining({ projectId: project.id })])
    );
  });

  it.each([PSO.UNDER_REVIEW, PSO.PUBLISHED])(
      'Not allowed to remove datasets from project in %s status', async (status) => {
    const datasetProject = await createTestDatasetProject(status);

    const promise = doQuery<DatasetType>(
      updateDataset, { datasetId: datasetProject.datasetId, input: { projectIds: [] }}
    );

    await expect(promise).rejects.toThrowError(/under_review_or_published/);
    const { projectId } = await testEntityManager.findOneOrFail(
      DatasetProjectModel, { datasetId: datasetProject.datasetId }
    );
    expect(projectId).toBeDefined();
  });

  it.each([PSO.UNDER_REVIEW, PSO.PUBLISHED])(
      'Admins allowed to remove datasets from project in %s status', async (status) => {
    const datasetProject = await createTestDatasetProject(PSO.UNDER_REVIEW);

    mockSmApi.smAPIRequest.mockReturnValue('');

    await doQuery<DatasetType>(
      updateDataset,
      { datasetId: datasetProject.datasetId, input: { projectIds: [] }},
      { context: adminContext }
    );

    const updDsProject = await testEntityManager.findOne(DatasetProjectModel, { datasetId: datasetProject.datasetId });
    expect(updDsProject).toBeFalsy();
  });
});
