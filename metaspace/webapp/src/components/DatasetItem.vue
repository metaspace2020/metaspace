<template>
  <div class="dataset-item">

    <el-dialog title="Provided metadata" v-model="showMetadataDialog">
      <dataset-info :metadata="metadata"
        expandedKeys="['Sample information', 'Sample preparation']">
      </dataset-info>
    </el-dialog>

    <div class="ds-status">
      <i class="el-icon-loading" v-if="dataset.status == 'QUEUED'"
         style="color: blue;" />
      <i class="el-icon-circle-check" v-if="dataset.status == 'FINISHED'"
         style="color: green;" />
      <i class="el-icon-warning" v-if="dataset.status == 'FAILED'"
         style="color: red;" />
      <i class="el-icon-loading" v-if="dataset.status == 'STARTED'"
         style="color: darkgreen;"/>
    </div>

    <div class="ds-info">
      <div>
        <b>{{ formatDatasetName }}</b>
      </div>

      <div style="color: darkblue;">
        <span class="ds-add-filter"
              title="Filter by species"
              @click="addFilter('organism')">
          {{ formatOrganism }}</span>,
        <span class="ds-add-filter"
              title="Filter by organism part"
              @click="addFilter('organismPart')">
          {{ formatOrganismPart }}</span>

        <span class="ds-add-filter"
              title="Filter by condition"
              @click="addFilter('condition')">
          ({{ formatCondition }})</span>
      </div>

      <div>
        <span class="ds-add-filter"
              title="Filter by ionisation source"
              @click="addFilter('ionisationSource')">
          {{ dataset.ionisationSource }}</span> +
        <span class="ds-add-filter"
              title="Filter by analyzer type"
              @click="addFilter('analyzerType')">
          {{ dataset.analyzer.type }}</span>,
        <span class="ds-add-filter"
              title="Filter by polarity"
              @click="addFilter('polarity')">
          {{ dataset.polarity.toLowerCase() }} mode
        </span>,
        resolving power {{ formatResolvingPower }}
      </div>

      <div style="font-size: 15px;">
        Submitted <span class="s-bold">{{ formatDate }}</span>
        at {{ formatTime }} by {{ formatSubmitter }},
        <span class="s-inst ds-add-filter"
              v-html="formatInstitution"
              title="Filter by this lab"
              @click="addFilter('institution')"></span>
      </div>
    </div>

    <div class="ds-actions">
      <i class="el-icon-picture"></i>
      <router-link :to="resultsHref" >Browse annotations</router-link>
      <br/>

      <i class="el-icon-view"></i>
      <a @click="showMetadata" class="metadata-link">Show full metadata</a>
      <br/>

      <i class="el-icon-edit" v-if="haveEditAccess"></i>
      <router-link v-if="haveEditAccess" :to="editHref">Edit metadata</router-link>
    </div>
  </div>
</template>

<script>
 import DatasetInfo from './DatasetInfo.vue';
 import capitalize from 'lodash/capitalize';

 function removeUnderscores(str) {
   return str.replace(/_/g, ' ');
 }

 export default {
   name: 'dataset-item',
   props: ['dataset'],
   components: {
     DatasetInfo
   },
   computed: {
     resultsHref() {
       return {
         path: '/annotations',
         query: {ds: JSON.stringify([this.dataset.id]), db: this.preferredDatabase}
       };
     },

     formatSubmitter() {
       const { name, surname } = this.dataset.submitter;
       return name + " " + surname;
     },

     formatInstitution() {
       return this.dataset.institution.replace(/\s/g, '&nbsp;');
     },

     formatDatasetName() {
       return this.dataset.name.split('//', 2).pop();
     },

     analyzerType() {
       return this.dataset.analyzer.type;
     },

     uploadedDateTime() {
       const unknown = {date: '????-??-??', time: '??:??'};
       if (!this.dataset.id)
         return unknown;

       const fields = this.dataset.id.split('_');
       if (fields.length < 2)
         return unknown;

       const date = fields[0];
       const time = fields[1].split('m')[0].replace('h', ':');
       return {
         date,
         time
       }
     },

     formatDate() {
       return this.uploadedDateTime.date;
     },

     formatTime() {
       return this.uploadedDateTime.time;
     },

     metadata() {
       return JSON.parse(this.dataset.metadataJson);
     },

     preferredDatabase() {
       return this.metadata.metaspace_options.Metabolite_Database;
     },

     formatOrganism() {
       return removeUnderscores(this.dataset.organism);
     },

     formatCondition() {
       return removeUnderscores(this.dataset.condition).toLowerCase();
     },

     formatOrganismPart() {
       return removeUnderscores(this.dataset.organismPart).toLowerCase();
     },

     formatResolvingPower() {
       const rp = this.metadata.MS_Analysis.Detector_Resolving_Power;
       const {mz, Resolving_Power} = rp;
       return (Resolving_Power / 1000).toFixed(0) + 'k @ ' + mz;
     },

     haveEditAccess() {
       const {user} = this.$store.state;
       if (!user)
         return false;
       if (user.role == 'admin')
         return true;
       if (user.email == this.dataset.submitter.email)
         return true;
       return false;
     },

     editHref() {
       return {
         name: 'edit-metadata',
         params: {dataset_id: this.dataset.id}
       };
     }
   },
   data() {
     return {
       showMetadataDialog: false
     };
   },
   methods: {
     showMetadata() {
       this.showMetadataDialog = true;
     },

     addFilter(field) {
       let filter = Object.assign({}, this.$store.getters.filter);
       if (field == 'polarity')
         filter['polarity'] = capitalize(this.dataset.polarity);
       else
         filter[field] = this.dataset[field] || this[field];
       this.$store.commit('updateFilter', filter);
     }
   }
 }
</script>

<style>
 .dataset-item {
   border-radius: 5px;
   width: 100%;
   max-width: 800px;
   margin: 3px;
   padding: 0px;
   border: 1px solid #cce4ff;
   display: flex;
   flex-direction: row;
   justify-content: space-between;
 }

 .ds-status {
   display: flex;
   padding-left: 5px;
   flex-direction: column;
   justify-content: center;
 }

 .ds-info {
   padding: 10px;
   margin: 0px;
   width: 72%;
 }

 .ds-actions {
   padding: 10px 0px 10px 0px;
   margin: 0px;
   width: 25%;
 }

 .metadata-link {
   text-decoration: underline;
   cursor: pointer;
 }

 .s-bold {
   font-weight: bold;
 }

 .s-inst {
   color: sienna;
 }

 .ds-add-filter {
   cursor: pointer;
 }

</style>
