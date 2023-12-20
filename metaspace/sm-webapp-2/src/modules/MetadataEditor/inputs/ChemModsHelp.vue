<template>
  <div style="max-width: 500px;">
    <p>
      This setting is intended for use in samples that have been treated with a derivatization agent.
      Chemical modifications add and remove elements from every formula in the selected database.
      Unmodified formulas will also be annotated, and each modification will have an independent FDR ranking.
    </p>
    <p>
      Extra scrutiny must be given to the results annotated with chemical modifications,
      as modified formulas are often isomeric to other unmodified molecules in the database.
    </p>
    <p>
      Modifications should be entered as a series of formulas being removed
      with <span class="example-input">-</span> and added with <span class="example-input">+</span>.
      For example, derivatization with Girard's Reagent T would be
      entered as <span class="example-input">-O+C5H12N3O</span>.
    </p>
    <p>
      In cases where a derivatization agent adds a permanent charge, such as with the
      quaternary ammonium moiety in the above example, additional steps are needed to ensure that
      METASPACE searches for the correct mass. Either
      the <span class="example-input">[M]⁺</span> or <span class="example-input">[M]⁻</span> adduct
      should be selected, or the number of hydrogens in the chemical modification formula should be adjusted
      so that the correct mass is calculated after
      the <span class="example-input">[M+H]⁺</span> or <span class="example-input">[M-H]⁻</span> adduct is applied.
    </p>
  </div>
</template>

<script>
export default {
  name: 'ChemModsHelp',
}
</script>

<style scoped>
.example-input {
  background: #EEEEEE;
  padding: 2px 8px;
  white-space: nowrap;
}
</style>
