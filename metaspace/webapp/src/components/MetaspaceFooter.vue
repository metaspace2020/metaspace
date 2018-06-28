<template>
  <div id="metaspace-footer">
    <div id="footer-contents">
      <img class="footer-logo" src="../assets/eu_flag.jpg"></img>
      <div id="footer-text">
        We acknowledge funding from the
        European Union’s Horizon 2020 programme under the grant agreement 634402
        as well as from the National Institutes of Health NIDDK Kidney Precision Medicine Project.
      </div>
      <!--img class="footer-logo" src="../assets/aws_logo.png" style="padding-left: 52px;"></img-->
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
   margin-top: 100px;
   position: absolute;
   height: 30px;
   bottom: 0;
   width: 100%;
 }

 #footer-contents {
   display: flex;
   flex-direction: row;
   border-top: solid #bbb 1px;
   justify-content: center;
 }

 #footer-text {
   padding: 0px 10px;
   font-size: 12px;
   color: #777;
   display: flex;
   flex-direction: column;
   justify-content: center;
 }

 .footer-logo {
   height: 29px;
   width: auto;
   margin: 0px;
 }
</style>
