<template>
  <div class="desc-popover">
    <p>
      Database selection determines which metabolites can be annotated.
      Many databases are for specific types of sample, please see their respective webpages for details.
      We show either the version number or a time-stamped date of export.<br/>
      <b>HMDB-v4</b> is our suggested choice for mammalian datasets.
    </p>
    <div>
      <b>Brassica Napus database (BraChemDB):</b>
      A curated rapeseed database from LC-MS/MS measurements.
      <el-popover trigger="hover" placement="top">
        <div class="desc-cite-popover">University of Rennes 1</div>
        <span slot="reference" class="desc-cite">Citation</span>
      </el-popover>
    </div>
    <div>
      <b><a href="https://www.ebi.ac.uk/chebi/aboutChebiForward.do">Chemical Entities of Biological Interest (ChEBI)</a>:</b>
      ChEBI is a database and ontology of products of nature or synthetic products used to intervene in the processes of living organisms.
      <el-popover trigger="hover" placement="top">
        <div class="desc-cite-popover">
          Hastings J, Owen G, Dekker A, Ennis M, Kale N, Muthukrishnan V, Turner S, Swainston N, Mendes P, Steinbeck C. (2016).
          ChEBI in 2016: Improved services and an expanding collection of metabolites.
          <a href="http://europepmc.org/abstract/MED/26467479">Nucleic Acids Res.</a>
        </div>
        <span slot="reference" class="desc-cite">Citation</span>
      </el-popover>
    </div>
    <div>
      <b><a href="http://www.hmdb.ca/about">Human Metabolome Database (HMDB)</a>:</b>
      Database containing small molecule metabolites known to be in the human body.
      <b>HMDB-endogenous</b> is a filtered version of HMDB that contains only molecules labelled in the database as endogenously produced.
      <el-popover trigger="hover" placement="top">
        <div class="desc-cite-popover">
          Wishart DS, Feunang YD, Marcu A, Guo AC, Liang K, et al.,
          HMDB 4.0 &mdash; The Human Metabolome Database for 2018.
          Nucleic Acids Res. 2018. Jan 4;46(D1):D608-17.
          <a href="http://www.ncbi.nlm.nih.gov/pubmed/29140435">29140435</a>
        </div>
        <span slot="reference" class="desc-cite">Citation</span>
      </el-popover>
    </div>
    <div>
      <b><a href="http://www.lipidmaps.org/data/databases.html">LIPID Metabolites And Pathways Strategy (LipidMaps)</a>:</b>
      An experimentally determined list of all of the major and many minor lipid species in mammalian cells.
      <el-popover trigger="hover" placement="top">
        <div class="desc-cite-popover">
          LIPID MAPS structure database.
          Sud M., Fahy E., Cotter D., Brown A., Dennis E., Glass C., Murphy R., Raetz C., Russell D., and Subramaniam S.,
          Nucleic Acids Research 35, D527-32 (2006)
        </div>
        <span slot="reference" class="desc-cite">Citation</span>
      </el-popover>
    </div>
    <div>
      <b><a href="http://pseudomonas.umaryland.edu/PAMDB">Pseudomonas aeruginosa Metabolome Database (PAMDB)</a>:</b>
      An experimentally determined database containing extensive metabolomic data and metabolic pathway diagrams about 
      Pseudomonas aeruginosa (reference strain PAO1).
      <el-popover trigger="hover" placement="top">
        <div class="desc-cite-popover">
          Weiliang Huang, Luke K. Brewer, Jace W. Jones, Angela T. Nguyen, Ana Marcu, David S. Wishart,
          Amanda G. Oglesby-Sherrouse, Maureen A. Kane, and Angela Wilks (2018).
          PAMDB: a comprehensive Pseudomonas aeruginosa metabolome database.
          Nucleic Acids Res. 46(D1):D575-D580.
          DOI: <a href="https://academic.oup.com/nar/article-lookup/doi/10.1093/nar/gkx1061">10.1093/nar/gkx1061</a>
        </div>
        <span slot="reference" class="desc-cite">Citation</span>
      </el-popover>
    </div>
    <div>
      <b><a href="http://www.swisslipids.org/#/about">SwissLipids</a>:</b>
      The set of known, expert curated lipids provided plus a library of theoretical lipid structures.
      <el-popover trigger="hover" placement="top">
        <div class="desc-cite-popover">
          Lucila Aimo, Robin Liechti, Nevila Hyka-Nouspikel, Anne Niknejad, Anne Gleizes, Lou Götz, Dmitry Kuznetsov,
          Fabrice P.A. David, F. Gisou van der Goot, Howard Riezman, Lydie Bougueleret, Ioannis Xenarios, Alan Bridge;
          The SwissLipids knowledgebase for lipid biology, <i>Bioinformatics</i>,
          Volume 31, Issue 17, 1 September 2015, Pages 2860–2866,
          <a href="https://doi.org/10.1093/bioinformatics/btv285">https://doi.org/10.1093/bioinformatics/btv285</a>
        </div>
        <span slot="reference" class="desc-cite">Citation</span>
      </el-popover>
    </div>
  </div>
</template>
<script>
  export default {
    name: 'database-descriptions'
  };
</script>
<style>
  .desc-popover {
    width: 80vh;
    max-width: 600px;
    word-break: normal;
    text-align: left;
  }
  .desc-cite-popover {
    max-width: 400px;
    word-break: normal;
    text-align: left;
  }
  .desc-cite {
    text-decoration: dotted underline;
    cursor: pointer;
  }
</style>
