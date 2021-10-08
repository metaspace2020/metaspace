import { mount } from '@vue/test-utils'
import router from '../../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../../tests/utils/mockGraphqlClient'
import Vue from 'vue'
import DownloadDialog from './DownloadDialog'

const TestDownloadDialog = Vue.component('download-dialog-wrapper', {
  functional: true,
  render: (h, { props }) => h(DownloadDialog, { props }),
})

describe('Datasets/DownloadDialog', () => {
  it('should match snapshot', async() => {
    initMockGraphqlClient({
      Query: () => ({
        dataset: () => {
          return {
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
          }
        },
      }),
    })
    const propsData = {
      datasetId: '2020-01-02_03h04m05s',
      datasetName: 'Mouse whole body DHB',
    }
    const wrapper = mount(TestDownloadDialog, { router, apolloProvider, propsData })
    await Vue.nextTick()

    expect(wrapper.element).toMatchSnapshot()
  })
})
