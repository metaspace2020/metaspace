<template>
  <div class="adducts-help">
    <p>
      Each selected adduct is applied to every molecule in the selected database.
      Only adducts that commonly form with the chosen ionization source or MALDI matrix should be selected,
      as searching for improbable adducts is likely to generate spurious annotations.
    </p>
    <p>
      We recommend selecting <span class="example-input">[M+H]⁺</span>, <span class="example-input">[M+Na]⁺</span>,
      <span class="example-input">[M+K]⁺</span> in positive mode,
      and <span class="example-input">[M-H]⁻</span>,&nbsp;<span class="example-input">[M+Cl]⁻</span> in negative mode.
    </p>
    <p>
      For ESI-based sources <span class="example-input">[M+NH₄]⁺</span> should also be selected in positive mode.
    </p>
    <p>
      <span class="example-input">[M]⁺</span> and <span class="example-input">[M]⁻</span> should generally only be
      selected when annotating custom databases that have had adducts merged into their molecular formulas, or
      in cases when a derivatization agent causes molecules to become permanently charged.
    </p>
  </div>
</template>

<script>
export default {
  name: 'AdductsHelp',
}
</script>

<style scoped>
  .adducts-help {
    max-width: 400px;
  }
  .example-input {
    background: #EEEEEE;
    padding: 2px 0;
    white-space: nowrap;
  }
</style>
