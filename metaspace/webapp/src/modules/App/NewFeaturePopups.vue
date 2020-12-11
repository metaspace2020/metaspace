<template>
  <div>
    <new-feature-popup
      feature-key="uploadCustomDatabases"
      title="Custom Metabolite Databases"
    >
      <p>
        In addition to metabolite databases provided by METASPACE, you can now use your own custom databases.
        To upload a database, please go to your Group page.
      </p>
    </new-feature-popup>
    <new-feature-popup
      feature-key="groupDatabasesTab"
      title="Custom Metabolite Databases"
    >
      <p>
        Use this tab to upload metabolite databases.
        After successful upload, the database will be available in the Upload page.
      </p>
    </new-feature-popup>
    <new-feature-popup
      feature-key="multipleIonImages"
      title="Ion Image Channels"
    >
      <p>
        Overlay multiple ion images from the same dataset. Scale and color each image, or lock the scale across all images.
      </p>
      <p>
        &ldquo;Link to this annotation&rdquo; will preserve the layers and settings for collaborators.
      </p>
    </new-feature-popup>
  </div>
</template>
<script lang="ts">
import Vue from 'vue'

import NewFeaturePopup from '../NewFeaturePopup/NewFeaturePopup.vue'

export default Vue.extend({
  components: {
    NewFeaturePopup,
  },
})
</script>
