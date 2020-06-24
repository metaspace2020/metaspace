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
  props() {
    return {}
  },
  data() {
  },
  mounted() {
    const uppy = Uppy({
      debug: true,
      autoProceed: true,
      restrictions: {
        maxFileSize: 150 * 2 ** 20, // 150MB
        maxNumberOfFiles: 1,
        allowedFileTypes: ['.csv'],
      },
      meta: {},
    })
    uppy.use(Dashboard, {
      inline: true,
      height: 256,
      target: '#UppyDashboard',
    })
    uppy.use(AwsS3Multipart, {
      limit: 2,
      companionUrl: config.companionUrl || `${window.location.origin}/database_upload`,
    })

    this.uppy = uppy
    console.log(uppy)
  },
  beforeDestroy() {
    this.uppy.destroy()
  },
}
</script>
<style src="@uppy/core/dist/style.css"></style>
<style src="@uppy/dashboard/dist/style.css"></style>
<style>
  .uppy-Root {
    @apply font-sans;
    color: inherit;
  }
  .uppy-Dashboard-inner {
    @apply bg-gray-100;
  }
</style>
