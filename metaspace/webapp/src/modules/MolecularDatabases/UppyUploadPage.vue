<template>
  <div id="UppyDashboard"></div>
</template>

<script>

import * as Uppy from '@uppy/core'
import * as AwsS3Multipart from '@uppy/aws-s3-multipart'
import * as Dashboard from '@uppy/dashboard'

import config from '../../lib/config'

export default {
  name: 'UppyUploadPage',
  data() {
  },
  mounted() {
    const uppy = Uppy({
      debug: true,
      autoProceed: false,
      restrictions: {
        maxFileSize: 150 * 2 ** 20, // 150MB
        maxNumberOfFiles: 1,
        allowedFileTypes: ['.csv'],
      },
      meta: {},
    })
    uppy.use(Dashboard, {
      inline: true,
      target: '#UppyDashboard',
    })
    uppy.use(AwsS3Multipart, {
      limit: 2,
      companionUrl: config.companionUrl || `${window.location.origin}/database_upload`,
    })
  },
}
</script>

<style src="@uppy/core/dist/style.css"></style>
<style src="@uppy/dashboard/dist/style.css"></style>
