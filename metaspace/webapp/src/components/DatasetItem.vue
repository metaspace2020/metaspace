<template>
  <div class="dataset-item">

    <el-dialog title="Provided metadata" v-model="showMetadataDialog">
      <dataset-info :metadata="metadata"
        expandedKeys="['Sample information', 'Sample preparation']">
      </dataset-info>
    </el-dialog>

    <div class="ds-info">
      <div>
        <b>{{ formatDatasetName }}</b>
      </div>

      <div style="color: darkblue;" >
        {{ formatOrganismPart }}
      </div>

      <div>
        {{ dataset.ionisationSource }} + {{ dataset.analyzer.type }},
        {{ dataset.polarity.toLowerCase() }} mode,
        resolving power {{ formatResolvingPower }}
      </div>

      <div style="font-size: 15px;">
        Submitted <span class="s-bold">{{ formatDate }}</span>
        at {{ formatTime }} by {{ formatSubmitter }},
        <span class="s-inst" v-html="formatInstitution"></span>
      </div>
    </div>

    <div class="ds-actions">
      <router-link :to="resultsHref" target="_blank"
                   title="Opens in a new tab">Browse annotations</router-link>
      <br/>
      <a @click="showMetadata" class="metadata-link">Show full metadata</a>

      <br/>
      <router-link v-if="haveEditAccess" :to="editHref">
        Edit metadata
      </router-link>
    </div>
  </div>
</template>

<script>
 import DatasetInfo from './DatasetInfo.vue';

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
         query: {ds: this.dataset.name}
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

     uploadedDateTime() {
       const fields = this.dataset.id.split('_');
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

     formatResolvingPower() {
       const rp = this.metadata.MS_Analysis.Detector_Resolving_Power;
       const {mz, Resolving_Power} = rp;
       return (Resolving_Power / 1000).toFixed(0) + 'k @ ' + mz;
     },

     formatOrganismPart() {
       try {
         const metadata = JSON.parse(this.dataset.metadataJson);
         const info = metadata.Sample_Information;
         const {Organism, Condition, Organism_Part} = info;

         let result = '';
         if (Condition && Condition != '-')
           result += Condition.replace(/_([A-Z])/g,
                                       (_, s) => ' ' + s.toLowerCase()) + ' ';

         if (!Organism || Organism == '-')
           return '';
         result += Organism.replace(/_/g, ' ').toLowerCase();

         if (!Organism_Part || Organism_Part == '-')
           return result;
         result += ', ' + Organism_Part.replace(/_/g, ' ').toLowerCase();
         return result;
       } catch (e) {
         console.log(e);
         return '';
       }
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
 }

 .ds-info {
   display: inline-block;
   padding: 10px;
   margin: 0px;
   width: 72%;
 }

 .ds-actions {
   display: inline-block;
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

</style>
