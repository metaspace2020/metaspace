<template>
  <content-page>
    <h1>Relevant Publications</h1>
    <h2 id="ours">
      Our publications presenting METASPACE or its methods (5)
    </h2>
    <ul>
      <publication-item
        title="Spatial Metabolomics and Imaging Mass Spectrometry in the Age of Artificial Intelligence"
        authors="Alexandrov T"
        publisher="Annu. Rev. Biomed. Data Sci."
        year="2020"
        link="https://doi.org/10.1146/annurev-biodatasci-011420-031537"
      />
      <publication-item
        title="OffsampleAI: artificial intelligence approach to recognize off-sample mass spectrometry images"
        authors="Ovchinnikova K, Kovalev V, Stuart L, Alexandrov T"
        publisher="BMC Bioinformatics"
        year="2020"
        link="https://doi.org/10.1186/s12859-020-3425-x"
      />
      <publication-item
        title="ColocML: Machine learning quantifies co-localization between mass spectrometry images"
        authors="Ovchinnikova K, Stuart L, Rakhlin A, Nikolenko S, Alexandrov T"
        publisher="Bioinformatics"
        year="2020"
        link="https://doi.org/10.1093/bioinformatics/btaa085"
      />
      <publication-item
        title="METASPACE: A community-populated knowledge base of spatial metabolomes in health and disease"
        authors="Alexandrov T, Ovchnnikova K, Palmer A, Kovalev V, et al."
        publisher="BioRxiv"
        year="2019"
        link="https://www.biorxiv.org/content/10.1101/539478v1.abstract"
      />
      <publication-item
        title="FDR-controlled metabolite annotation for high-resolution imaging mass spectrometry"
        authors="Palmer A, Phapale P, Chernyavsky I, Lavigne R, Fay D, Tarasov A, Kovalev V, Fuchser J, Nikolenko S, Pineau C, Becker M, Alexandrov T"
        publisher="Nat. Methods"
        year="2017"
        link="https://doi.org/10.1038/nmeth.4072"
      />
    </ul>

    <h2 id="others">
      Other publications
    </h2>
    <a
      class="publication-link"
      href="https://scholar.google.com/scholar?q=%22metaspace2020.eu%22"
      target="_blank"
    >
      Research articles using METASPACE (133)
      <stateful-icon class="h-4 w-4 pointer-events-none">
        <external-window-svg />
      </stateful-icon>
    </a>
    <a
      class="publication-link"
      href="https://scholar.google.com/scholar?q=%22metaspace2020.eu%22&as_rr=1"
      target="_blank"
    >
      Reviews (16)
      <stateful-icon class="h-4 w-4 pointer-events-none">
        <external-window-svg />
      </stateful-icon>
    </a>
    <cite-metaspace />
  </content-page>
</template>
<script>
import ContentPage from '../../components/ContentPage.vue'
import PublicationItem from './PublicationItem'
import StatefulIcon from '../../components/StatefulIcon.vue'
import ExternalWindowSvg from '../../assets/inline/refactoring-ui/icon-external-window.svg'
import { CiteMetaspace } from './CiteMetaspace'

/*
Script to parse Paperpile lists
-------------------------------
```
items = document.querySelectorAll('.pp-pub-item')
Array.from(items)
  .map(i => ({
    title: i.querySelector('.pp-pub-title').innerText,
    authors: i.querySelector('.pp-pub-authors').innerText,
    publisher: i.querySelector('.pp-pub-journal').innerText,
    year: i.querySelector('.pp-pub-year').innerText,
    link: i.querySelector('.pp-pub-link').href,
    published: JSON.parse(i.querySelector('[ppdata]').attributes.ppdata.value).published,
  }))
  .sort((a, b) => {
    const _a = new Date(a.published.year, (a.published.month || 1) - 1, a.published.day || 1)
    const _b = new Date(b.published.year, (b.published.month || 1) - 1, b.published.day || 1)
    if (_a > _b) return -1
    if (_b > _a) return 1
    return 0
  })
  .map(({ published, ...i }) => i)
```
*/
export default {
  name: 'PublicationsPage',
  components: {
    ContentPage,
    PublicationItem,
    StatefulIcon,
    ExternalWindowSvg,
    CiteMetaspace,
  },
}
</script>
<style scoped>
  ul {
    @apply mt-3;
  }
  ul >>> p {
    max-width: none;
  }
  .publication-link {
    @apply flex font-semibold items-center;
    margin-top: 0.5rem !important;
  }
</style>
