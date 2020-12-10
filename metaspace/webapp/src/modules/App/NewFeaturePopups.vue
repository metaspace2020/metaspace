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
      title="Multiple Ion Images"
    >
      <p>
        The best thing since sliced bread.
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
