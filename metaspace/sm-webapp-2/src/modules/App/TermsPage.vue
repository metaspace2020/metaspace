<template>
  <content-page>
    <h1>Terms of Service</h1>
    <h2>Service definition</h2>
    <ul>
      <li>
        <p>
          METASPACE is an open cloud software platform for imaging mass spectrometry data hosted at
          <a
            href="https://metaspace2020.eu"
            rel="noopener noreferrer nofollow"
          >
            https://metaspace2020.eu<!-- -->
          </a>.
        </p>
      </li>
      <li>
        <p>
          Anyone can submit to METASPACE a dataset including imzML data files, metadata, optical images, and other
          supporting information for metabolite annotation and other data analyses.
        </p>
      </li>
      <li>
        <p>
          METASPACE performs data processing; the results for each dataset are stored associated with the dataset
          and the submitter.
        </p>
      </li>
      <li>
        <p>
          The access to the dataset and METASPACE results is provided through either the METASPACE web app or the
          METASPACE API, as explained in the documentation.
        </p>
      </li>
      <li>
        <p>
          The dataset is stored on a cloud or storage selected by the METASPACE team. The access to data,
          metadata, and other supporting information is provided to the METASPACE software and the METASPACE
          team only for the purpose of performing the expected services.
        </p>
      </li>
      <li>
        <p>
          The METASPACE team does its best to adhere to the Terms of Service and to provide the results but does
          not bear any liability for any consequences associated with providing the service or any other related
          damages.
        </p>
      </li>
    </ul>
    <h2>Data ownership</h2>
    <ul>
      <li>
        <p>
          The dataset submitted to METASPACE belongs to the submitter and is provided to the METASPACE team
          solely for the purpose of completing expected services.
        </p>
      </li>
      <li>
        <p>
          The results produced by METASPACE belong to the submitter.
        </p>
      </li>
      <li>
        <p>
          The submitter can request the deletion of their dataset or results at any point in time either by using
          capacities provided by the METASPACE team or by contacting us at
          <a
            href="mailto:contact@metaspace2020.eu"
            rel="noopener noreferrer nofollow"
          >
            contact@metaspace2020.eu<!-- -->
          </a>, unless there is a special agreement overriding it.
        </p>
      </li>
      <li>
        <p>
          When the submitter associates a dataset with either a METASPACE group or METASPACE project, the submitter
          grants the equal rights of the ownership and sharing of the indicated dataset or the associated METASPACE
          results to the admin(s) of the respective group or project.
        </p>
      </li>
      <li>
        <p>
          When the submitter requests creating a permanent link to a dataset and/or the associated METASPACE
          results for a peer-review publication through the “Scientific Publishing” feature, the explicitly stated
          parts of the dataset and the results become permanently public and the submitter cannot delete it
          anymore.
        </p>
      </li>
      <li>
        <p>
          A dataset or parts of it can be shared publicly by the submitter or by any person who is granted
          this right from the submitter.
        </p>
      </li>
      <li>
        <p>
          When shared, a specified dataset or parts of it are shared under the CC BY 4.0 license
          (<a
            href="https://creativecommons.org/licenses/by/4.0/"
            rel="noopener noreferrer nofollow"
          >
            <!-- -->https://creativecommons.org/licenses/by/4.0/<!-- -->
          </a>) to anyone accessing METASPACE and to the METASPACE team.
        </p>
      </li>
      <li>
        <p>
          When a submitter reverts a public dataset or public results to the private mode, METASPACE cannot ensure
          that while being in the public mode the dataset or the results were not downloaded, used, or re-used by
          the METASPACE team or anyone accessing METASPACE.
        </p>
      </li>
    </ul>
  </content-page>
</template>
<script>
import ContentPage from '../../components/ContentPage.vue'

export default {
  name: 'TermsPage',
  components: {
    ContentPage,
  },
}
</script>
