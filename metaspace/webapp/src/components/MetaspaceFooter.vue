<template>
  <div id="metaspace-footer">
    <div id="footer-contents">
      <img class="footer-logo" src="../assets/eu_flag.jpg"></img>
      <div id="footer-text">
        This project has been made possible thanks to funding from the European Union's Horizon 2020 research and innovation programme through the Horizon2020 Program under the agreement No 642976 and AWS Cloud Credits for Research
      </div>
      <img class="footer-logo" src="../assets/aws_logo.png"></img>
    </div>
  </div>
</template>

<script>
 export default {
   name: 'metaspace-footer'
 }
</script>

<style>
 #metaspace-footer {
   background: #eee;
   margin-top: 85px;
   position: absolute;
   height: 52px;
   bottom: 0;
   width: 100%;
 }

 #footer-contents {
   display: flex;
   flex-direction: row;
   border-top: solid purple 1px;
   justify-content: space-between;
 }

 #footer-text {
   padding: 0px 10px;
   display: flex;
   flex-direction: column;
   justify-content: center;
 }

 .footer-logo {
   height: 40px;
   width: auto;
   margin: 5px;
 }
</style>
