<template>
    <div class="adduct-info-container">
        <el-col v-for="(other, idx) in sameAdductAnnotations" :key="idx"
                :xs="24" :sm="8" :md="8" :lg="8">
            <div class="small-peak-image" style="max-width: %">
                <span v-html="showAdduct(other.adduct)"></span><br/>
                {{  other.mz.toFixed(4) }}<br/>
                <image-loader :src="other.isotopeImages[0].url"
                            v-bind="imageLoaderSettings"
                            :colormap="colormap"
                            :max-height=250
                            style="overflow: hidden">
                </image-loader>
                <div class="rel-annot-details">
                MSM score: {{ other.msmScore.toFixed(3) }}<br/>
                Annotated @ {{ other.fdrLevel * 100 }}% FDR<br/>
                Max. intensity: {{ other.isotopeImages[0].maxIntensity.toExponential(2) }}
                </div>
            </div>
        </el-col>
    </div>
</template>

<script>
import { renderMolFormula } from '../../../util';

import ImageLoader from '../../ImageLoader.vue';
import { allAdductsQuery } from '../../../api/annotation';

export default {
    props: ['annotation', 'database', 'imageLoaderSettings'],
    components: { ImageLoader },
    computed: {
        colormap() {
            return this.$store.getters.settings.annotationView.colormap;
        }
    },
    apollo: {
        sameAdductAnnotations: {
            query: allAdductsQuery,
            variables() {
                return {
                    db: this.database,
                    datasetId: this.annotation.dataset.id,
                    molFormula: this.annotation.sumFormula
                };
            },
            update: data => data.allAnnotations.slice().sort((a, b) => a.mz - b.mz)
        }
    },
    methods: {
        showAdduct(adduct) {
            return renderMolFormula(this.annotation.sumFormula, adduct, this.annotation.dataset.polarity);
        }
    }
}
</script>

<style>
.adduct-info-container {
  display: flex;
  flex-direction: row;
}

.rel-annot-details {
  font-size: smaller;
}

.small-peak-image {
  font-size: 1rem;
  vertical-align: top;
  padding: 0 5px 0 5px;
  text-align: center;
}
</style>
