<template>
  <div id="UppyDashboard"></div>
</template>

<script>

import '@uppy/core/dist/style.css'
import '@uppy/dashboard/dist/style.css'

import * as Uppy from '@uppy/core'
import * as AwsS3Multipart from '@uppy/aws-s3-multipart'
import * as Dashboard from '@uppy/dashboard'

import config from '../../config'

export default {
  name: 'UppyUploadPage',
  data() {
  },
  mounted() {
    const uppy = Uppy({
      debug: true,
      autoProceed: false,
      restrictions: {
        maxNumberOfFiles: 1,
        allowedFileTypes: ['.csv']
      },
      meta: {},
    })
    uppy.use(Dashboard, {
      inline: true,
      target: '#UppyDashboard',
    })
    uppy.use(AwsS3Multipart, {
      limit: 2,
      companionUrl: config.companionUrl,
    })
  }
}
</script>

<style scoped>
</style>
