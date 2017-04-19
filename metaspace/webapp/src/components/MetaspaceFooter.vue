<template>
  <div id="metaspace-footer">
    <div id="footer-contents">
      <img class="footer-logo" src="../assets/eu_flag.jpg"></img>
      <div id="footer-text">
        This website is part of a project that has received funding from the European Union's Horizon 2020 research and innovation programme under grant agreement No 634402
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
