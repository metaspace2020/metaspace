<template>
  <div>
    <p>Thank you for considering submitting your data to METASPACE! Here are the key points you need to know:</p>

    <p><b>Public results, private data</b><br/> Annotation results for data submitted to METASPACE becomes public by default. The submitted data does not become public but you give us a permission to store and process it as well as publicly show and share the annotation results. At any point of time you can request that we delete your data or the annotation results.</p>

    <p><b>Type of MS:</b> We can annotate only FTICR- or Orbitrap- imaging MS data.</p>

    <!--<p><b>Format:</b> We can receive only data in the imzML (imaging MS) or mzML (LC-MS) centroided format. Please check out <a href="http://project.metaspace2020.eu/imzml">our instructions</a> for converting datasets into these formats. If you are experiencing difficulties, please contact your instrument vendor.</p>-->
    <p><b>Format:</b> We can receive only data in the imzML centroided format. Please check out <a href="http://project.metaspace2020.eu/imzml">our instructions</a> for converting datasets into this format. If you are experiencing difficulties, please contact your instrument vendor.</p>

    <p><b>Step-by-step tutorial:</b> Please read our <a href="https://www.slideshare.net/Metaspace2020/metaspace-training-course-ourcon-v-2017">training guide slides</a> providing an introduction to METASPACE as well as a step-by-step tutorial with screenshots.</p>

    <p><b>Questions or requests?</b> Please email us at <a href="mailto:contact@metaspace2020.eu">contact@metaspace2020.eu</a>. We are always happy to receive your feedback, both positive and negative.</p>

    <slot></slot>
    <p>Have fun using METASPACE!</p>
  </div>
</template>
