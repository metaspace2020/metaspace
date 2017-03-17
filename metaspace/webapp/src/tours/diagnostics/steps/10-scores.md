---
title: MSM score
target: '#scores-table'
placement: bottom
query: {show: 4}
---

Metabolite-spectrum match score is currently computed in a relatively simple manner.
Namely, it multiplies together a few heuristic scores:

- &rho;<sub>spatial</sub> measures weighted average of spatial correlations
between principal peak image and the rest, where weights are the corresponding theoretical abundances
- &rho;<sub>spectral</sub> throws away all spatial information and compares only total intensities
of isotopic peaks with predicted ratios
- &rho;<sub>chaos</sub> measures how chaotic the principal peak image is
