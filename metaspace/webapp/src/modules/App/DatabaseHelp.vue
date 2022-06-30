<template>
  <div class="v-rhythm-6">
    <p>
      Database selection determines which metabolites can be annotated.
      Many databases are for specific types of sample, please see their respective webpages for details.
      We show either the version number or a time-stamped date of export.
      Up to {{ maxMolDBs }} databases may be selected.
      <b>HMDB-v4</b> is our suggested choice for mammalian datasets.
    </p>
    <ul class="v-rhythm-3 max-w-measure-4">
      <li>
        <b><a href="https://www.protim.eu/en">Brassica Napus Database (BraChemDB)</a>:</b>
        The BraChemDB Database contains small molecule metabolites experimentally detected in the rapeseed Brassica napus,
        available only on METASPACE and provided by IGEPP’s Metabolic Profiling and Metabolomic Platform and Protim Core Facility,
        University of Rennes 1.
        <div>
          <el-popover
            trigger="hover"
            placement="bottom"
          >
            <div class="desc-cite-popover">
              <i>University of Rennes 1</i>
            </div>
            <span
              slot="reference"
              class="desc-cite"
            >Citation</span>
          </el-popover>
        </div>
      </li>
      <li>
        <b><a href="https://www.ebi.ac.uk/chebi/aboutChebiForward.do">Chemical Entities of Biological Interest (ChEBI)</a>:</b>
        ChEBI is a database and ontology of products of nature or synthetic products used to intervene in the processes of living organisms.
        <div>
          <el-popover
            trigger="hover"
            placement="bottom"
          >
            <div class="desc-cite-popover">
              Hastings J, Owen G, Dekker A, Ennis M, Kale N, Muthukrishnan V, Turner S, Swainston N, Mendes P, Steinbeck C. (2016).
              ChEBI in 2016: Improved services and an expanding collection of metabolites.
              <a href="http://europepmc.org/abstract/MED/26467479">Nucleic Acids Res.</a>
            </div>
            <span
              slot="reference"
              class="desc-cite"
            >Citation</span>
          </el-popover>
        </div>
      </li>
      <li>
        <b>Core Metabolome Database (CoreMetabolome):</b>
        METASPACE database of core mammalian metabolites and lipids.
        <p class="m-0 text-sm">
          <span class="text-gray-700 font-medium">
            Citation TBC
          </span>
          <a
            href="https://s3-eu-west-1.amazonaws.com/sm-mol-db/db_files_2021/core_metabolome/core_metabolome_v3.csv"
            class="ml-3"
            target="_blank"
            rel="noopener"
          >
            Download metabolite list
          </a>
        </p>
      </li>
      <li>
        <b><a href="https://go.drugbank.com/about">DrugBank</a>:</b>
        A comprehensive, web-accessible database that brings together quantitative chemical, physical, pharmaceutical
        and biological data about thousands of well-studied drugs and drug targets.
        <div>
          <el-popover
            trigger="hover"
            placement="bottom"
          >
            <div class="desc-cite-popover">
              Wishart, David S., et al. DrugBank: a comprehensive resource for in silico drug discovery and
              exploration. Nucleic acids research 34.suppl_1 (2006): D668-D672.
              <a href="https://doi.org/10.1093/nar/gkj067">https://doi.org/10.1093/nar/gkj067</a>
            </div>
            <span
              slot="reference"
              class="desc-cite"
            >Citation</span>
          </el-popover>
        </div>
      </li>
      <li>
        <b><a href="http://ecmdb.ca/about">E. coli Metabolome Database (ECMDB)</a>:</b>
        An expertly curated database containing extensive metabolomic data and metabolic pathway diagrams about
        Escherichia coli (strain K12, MG1655).
        <div>
          <el-popover
            trigger="hover"
            placement="bottom"
          >
            <div class="desc-cite-popover">
              Sajed, T., Marcu, A., Ramirez, M., Pon, A., Guo, A., Knox, C., Wilson, M., Grant, J., Djoumbou,
              Y. and Wishart, D. (2015). ECMDB 2.0: A richer resource for understanding the biochemistry of
              E. coli. Nucleic Acids Res, p.gkv1060
              <a href="https://www.ncbi.nlm.nih.gov/pubmed/26481353">https://www.ncbi.nlm.nih.gov/pubmed/26481353</a>
            </div>
            <span
              slot="reference"
              class="desc-cite"
            >Citation</span>
          </el-popover>
        </div>
      </li>
      <li>
        <b><a href="http://www.hmdb.ca/about">Human Metabolome Database (HMDB)</a>:</b>
        Database containing small molecule metabolites known to be in the human body.
        <b>HMDB-endogenous</b> is a filtered version of HMDB that contains only molecules labelled in the database as endogenously produced.
        <div>
          <el-popover
            trigger="hover"
            placement="bottom"
          >
            <div class="desc-cite-popover">
              Wishart DS, Feunang YD, Marcu A, Guo AC, Liang K, et al.,
              HMDB 4.0 &mdash; The Human Metabolome Database for 2018.
              Nucleic Acids Res. 2018. Jan 4;46(D1):D608-17.
              <a href="http://www.ncbi.nlm.nih.gov/pubmed/29140435">29140435</a>
            </div>
            <span
              slot="reference"
              class="desc-cite"
            >Citation</span>
          </el-popover>
        </div>
      </li>
      <li>
        <b><a href="https://www.genome.jp/kegg/compound/">Kyoto Encyclopedia of Genes and Genomes (KEGG)</a>:</b>
        Database containing COMPOUND collection of small molecules from KEGG.
        <div>
          <el-popover
            trigger="hover"
            placement="bottom"
          >
            <div class="desc-cite-popover">
              Minoru Kanehisa, Miho Furumichi, Mao Tanabe, Yoko Sato, Kanae Morishima.
              KEGG: new perspectives on genomes, pathways, diseases and drugs,
              Nucleic Acids Research 45, D353–D361 (2017).
              <a href="https://doi.org/10.1093/nar/gkw1092">10.1093/nar/gkw1092</a>
            </div>
            <span
              slot="reference"
              class="desc-cite"
            >Citation</span>
          </el-popover>
        </div>
      </li>
      <li>
        <b><a href="http://www.lipidmaps.org/data/databases.html">LIPID Metabolites And Pathways Strategy (LipidMaps)</a>:</b>
        An experimentally determined list of all of the major and many minor lipid species in mammalian cells.
        <div>
          <el-popover
            trigger="hover"
            placement="bottom"
          >
            <div class="desc-cite-popover">
              LIPID MAPS structure database.
              Sud M., Fahy E., Cotter D., Brown A., Dennis E., Glass C., Murphy R., Raetz C., Russell D., and Subramaniam S.,
              Nucleic Acids Research 35, D527-32 (2006)
            </div>
            <span
              slot="reference"
              class="desc-cite"
            >Citation</span>
          </el-popover>
        </div>
      </li>
      <li>
        <b>Natural Products Atlas (NPA):</b>
        Taken from the NPA homepage: "The Natural Products Atlas provides open access coverage of bacterial
        and fungal natural products, giving researchers the power to visualize the chemical diversity
        of the natural world."
        <div>
          <el-popover
            trigger="hover"
            placement="bottom"
          >
            <div class="desc-cite-popover">
              van Santen, J. A.; Jacob, G.; Leen Singh, A.; Aniebok, V.; Balunas, M. J.; Bunsko, D.;
              Carnevale Neto, F.; Castaño-Espriu, L.; Chang, C.; Clark, T. N.; Cleary Little, J. L.;
              Delgadillo, D. A.; Dorrestein, P. C.; Duncan, K. R.; Egan, J. M.; Galey, M. M.;
              Haeckl, F. P. J.; Hua, A.; Hughes, A. H.; Iskakova, D.; Khadilkar, A.; Lee, J.-H.;
              Lee, S.; LeGrow, N.; Liu, D. Y.; Macho, J. M.; McCaughey, C. S.; Medema, M. H.; Neupane,
              R. P.; O’Donnell, T. J.; Paula, J. S.; Sanchez, L. M.; Shaikh, A. F.; Soldatou, S.;
              Terlouw, B. R.; Tran, T. A.; Valentine, M.; van der Hooft, J. J. J.; Vo, D. A.;
              Wang, M.; Wilson, D.; Zink, K. E.; Linington, R. G.
              "The Natural Products Atlas: An Open Access Knowledge Base for Microbial Natural Products Discovery”,
              ACS Central Science, 2019, 5, 11, 1824-1833.
              <a href="https://doi.org/10.1021/acscentsci.9b00806">10.1021/acscentsci.9b00806</a>
            </div>
            <span
              slot="reference"
              class="desc-cite"
            >Citation</span>
          </el-popover>
        </div>
      </li>
      <li>
        <b>NGlycDB:</b>
        Database containing naturally occurring N-linked glycans. This DB is based on glycans reported in the
        GlyConnect platform and is filtered to include only N-linked glycans.
        We recommend selecting only +Na adduct when using this database.
        <div>
          <el-popover
            trigger="hover"
            placement="bottom"
          >
            <div class="desc-cite-popover">
              Veličković, Dušan, et al. "Rapid automated annotation and analysis of N-glycan mass spectrometry imaging
              data sets using NGlycDB in METASPACE." Analytical Chemistry 93.40 (2021): 13421-13425.
              <a href="https://doi.org/10.1021/acs.analchem.1c02347">10.1021/acs.analchem.1c02347</a>
            </div>
            <span
              slot="reference"
              class="desc-cite"
            >Citation</span>
          </el-popover>
          <a
            href="https://s3-eu-west-1.amazonaws.com/sm-mol-db/db_files_2021/nglyc/nglyc_v1.tsv"
            class="ml-3 text-sm"
            target="_blank"
            rel="noopener"
          >
            Download N-linked glycan list
          </a>
        </div>
      </li>
      <li>
        <b><a href="http://pseudomonas.umaryland.edu/PAMDB">Pseudomonas aeruginosa Metabolome Database (PAMDB)</a>:</b>
        An experimentally determined database containing extensive metabolomic data and metabolic pathway diagrams about
        Pseudomonas aeruginosa (reference strain PAO1).
        <div>
          <el-popover
            trigger="hover"
            placement="bottom"
          >
            <div class="desc-cite-popover">
              Weiliang Huang, Luke K. Brewer, Jace W. Jones, Angela T. Nguyen, Ana Marcu, David S. Wishart,
              Amanda G. Oglesby-Sherrouse, Maureen A. Kane, and Angela Wilks (2018).
              PAMDB: a comprehensive Pseudomonas aeruginosa metabolome database.
              Nucleic Acids Res. 46(D1):D575-D580.
              DOI: <a href="https://academic.oup.com/nar/article-lookup/doi/10.1093/nar/gkx1061">10.1093/nar/gkx1061</a>
            </div>
            <span
              slot="reference"
              class="desc-cite"
            >Citation</span>
          </el-popover>
        </div>
      </li>
      <li>
        <b><a href="http://www.swisslipids.org/#/about">SwissLipids</a>:</b>
        The set of known, expert curated lipids provided plus a library of theoretical lipid structures.
        <div>
          <el-popover
            trigger="hover"
            placement="bottom"
          >
            <div class="desc-cite-popover">
              Lucila Aimo, Robin Liechti, Nevila Hyka-Nouspikel, Anne Niknejad, Anne Gleizes, Lou Götz, Dmitry Kuznetsov,
              Fabrice P.A. David, F. Gisou van der Goot, Howard Riezman, Lydie Bougueleret, Ioannis Xenarios, Alan Bridge;
              The SwissLipids knowledgebase for lipid biology, <i>Bioinformatics</i>,
              Volume 31, Issue 17, 1 September 2015, Pages 2860–2866,
              <a href="https://doi.org/10.1093/bioinformatics/btv285">https://doi.org/10.1093/bioinformatics/btv285</a>
            </div>
            <span
              slot="reference"
              class="desc-cite"
            >Citation</span>
          </el-popover>
        </div>
      </li>
    </ul>
  </div>
</template>
<script>
import { limits } from '../../lib/config'

export default {
  name: 'DatabaseDescriptions',
  data() {
    return {
      maxMolDBs: limits.maxMolDBs,
    }
  },
}
</script>
<style scoped>
  ul {
    @apply mt-6;
  }
  .desc-cite-popover {
    @apply max-w-measure-2;
    word-break: normal;
    text-align: left;
  }
  .desc-cite {
    @apply text-sm font-medium text-gray-700;
    text-decoration: dotted underline;
    cursor: pointer;
  }
</style>
