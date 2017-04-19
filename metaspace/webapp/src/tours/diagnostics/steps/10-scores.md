---
title: MSM score
target: '#scores-table'
placement: bottom
query: {sections: 4}
---

The metabolite-spectrum match (MSM) score quantifies our confidence in an annotation (the closer to 1, the better). It evaluates the degree to which signals in the data match the theoretical isotope pattern for the molecular formula.

It is composed from the following measures:
- &rho;<sub>spatial</sub> quantifies the correlation between ion images of the isotope peaks. The score compares the principal peak against all others, weighted by the theoretical abundances
- &rho;<sub>spectral</sub> compares the average image intensity for each ion image against the theoretical abundances (considering only pixels where the principal peak is present).
- &rho;<sub>chaos</sub> estimates how spatially informative the principal peak ion image is.
See the [About](./about) section for more details.
