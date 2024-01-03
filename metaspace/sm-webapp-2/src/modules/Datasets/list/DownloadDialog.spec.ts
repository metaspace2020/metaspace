import {flushPromises, mount} from '@vue/test-utils'
import {defineComponent, nextTick, ref, h} from 'vue'
import DownloadDialog from './DownloadDialog'
import {vi} from "vitest";


const TestDownloadDialog = defineComponent({
  name: 'DownloadDialogWrapper',
  components: {
    DownloadDialog,
  },
  props: ['datasetId', 'datasetName'],
  setup(props) {
    return () => h(DownloadDialog, { ...props });
  },
});

describe('Datasets/DownloadDialog', () => {
  it('should match snapshot', async () => {
    vi.mock('@vue/apollo-composable', () => ({
      useQuery: vi.fn(() => ({
        result: ref({dataset:
             {
              downloadLinkJson: JSON.stringify({
                contributors: [
                  { name: 'Foo Bar', institution: 'EMBL' },
                ],
                license: {
                  code: 'CC BY 4.0',
                  name: 'Creative Commons Attribution 4.0 International Public License',
                  link: 'https://creativecommons.org/licenses/by/4.0/',
                },
                files: [
                  {
                    filename: 'Image5.ibd',
                    link: 'https://sm-engine-upload.s3.eu-west-1.amazonaws.com/test/Image5.ibd?AWSAccessKeyId=test'
                      + '&Expires=1585569522&Signature=test%3D',
                  },
                  {
                    filename: 'Image5.imzML',
                    link: 'https://sm-engine-upload.s3.eu-west-1.amazonaws.com/test/Image5.imzML?AWSAccessKeyId=test'
                      + '&Expires=1585569522&Signature=test%3D',
                  },
                ],
              }),

          }}),
        loading: ref(false),
        error: ref(null),
      })),
    }));

    const propsData = {
      datasetId: '2020-01-02_03h04m05s',
      datasetName: 'Mouse whole body DHB',
    }

    const wrapper = mount(TestDownloadDialog, {
      propsData
    })

    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })
})
