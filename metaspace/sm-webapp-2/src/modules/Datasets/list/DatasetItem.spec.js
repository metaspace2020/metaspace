import { mount } from '@vue/test-utils';
import DatasetItem from './DatasetItem.vue';
import router from "../../../router";
import store from "../../..//store";
import { nextTick } from "vue";
import {initMockGraphqlClient} from "../../../tests/utils/mockGraphqlClient";
import {DefaultApolloClient} from "@vue/apollo-composable";

let graphqlMockClient

describe('DatasetItem', () => {
  const user = { id: 'user' }
  const submitter = { id: 'submitter' }
  const dataset = {
    id: 'mockdataset',
    status: 'FINISHED',
    metadataJson: JSON.stringify({
      Metadata_Type: 'Imaging MS',
      MS_Analysis: {
        Detector_Resolving_Power: { mz: 1234, Resolving_Power: 123456 },
      },
    }),
    configJson: JSON.stringify({
      fdr: { scoring_model: null },
    }),
    databases: [
      { name: 'CHEBI', id: 2 },
      { name: 'HMDB-v2.5', id: 6 },
      { name: 'HMDB-v4', id: 22 },
    ],
    polarity: 'POSITIVE',
    fdrCounts: {
      databaseId: 6,
      dbName: 'HMDB-v2.5',
      levels: [10],
      counts: [20],
    },
    groupApproved: true,
    submitter,
    organism: 'organism',
    organismPart: 'organismPart',
    condition: 'condition',
    analyzer: {
      type: 'type'
    },
    projects: [],
    canEdit: true,
    canDelete: true,
    uploadDT: '2020-04-17T11:37:50.318667',
  }
  const underReview = { name: 'project', publicationStatus: 'UNDER_REVIEW' }
  const published = { name: 'project', publicationStatus: 'PUBLISHED' }

  beforeEach(async() => {
    graphqlMockClient = await initMockGraphqlClient({
      Query: () => ({
        allAnnotations: () => ([]),
        countAnnotations: () => 1,
      }),
    })
  })

  it('should match snapshot', async () => {
    const wrapper = mount(DatasetItem, {
      global: {
        plugins: [router, store],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      },
      props: {
        currentUser: submitter,
        dataset,
      },
    });

    await nextTick();

    expect(wrapper.html()).toMatchSnapshot();
  });

  it('should not show the publication status if cannot edit', async () => {
    const wrapper = mount(DatasetItem, {
      global: {
        plugins: [router, store],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      },
      props: {
        currentUser: user,
        dataset: {
          ...dataset,
          canEdit: false,
          projects: [published]
        },
      },
    });
    await nextTick();
    expect(wrapper.find('.test-publication-status').exists()).toBe(false)
  });

  it('should not show the publication status if processing', async () => {
    const wrapper = mount(DatasetItem, {
      global: {
        plugins: [router, store],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      },
      props: {
        currentUser: submitter,
        dataset: {
          ...dataset,
          projects: [published],
          status: 'ANNOTATING'
        }
      },
    });
    await nextTick();
    expect(wrapper.find('.test-publication-status').exists()).toBe(false)
  });

  it('should show "Under review" status', async () => {
    const wrapper = mount(DatasetItem, {
      global: {
        plugins: [router, store],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      },
      props: {
        currentUser: submitter,
        dataset: {
          ...dataset,
          projects: [underReview]
        }
      },
    });
    await nextTick();
    expect(wrapper.find('.test-publication-status').text()).toBe('Under review')
  });

  it('should show "Published" status', async () => {
    const wrapper = mount(DatasetItem, {
      global: {
        plugins: [router, store],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      },
      props: {
        currentUser: submitter,
        dataset: {
          ...dataset,
          projects: [published]
        }
      },
    });
    await nextTick();
    expect(wrapper.find('.test-publication-status').text()).toBe('Published')
  });

  it('should prefer "Published" status', async () => {
    const wrapper = mount(DatasetItem, {
      global: {
        plugins: [router, store],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      },
      props: {
        currentUser: submitter,
        dataset: {
          ...dataset,
          projects: [published, underReview]
        }
      },
    });
    await nextTick();
    expect(wrapper.find('.test-publication-status').text()).toBe('Published')
  });

});
