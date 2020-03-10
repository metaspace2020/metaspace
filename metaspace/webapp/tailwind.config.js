const tailwindDefaults = require('tailwindcss/defaultConfig')

module.exports = {
  // Reference: https://tailwindcss.com/docs/configuration
  // Defaults: https://github.com/tailwindcss/tailwindcss/blob/master/stubs/defaultConfig.stub.js
  theme: {
    fontFamily: {
      sans: ['Roboto', 'SUPERSCIPT_OVERRIDE', 'Helvetica', 'sans-serif'],
    },
    inset: {
      ...tailwindDefaults.theme.inset,
      '1/2': '50%',
    },
    opacity: {
      ...tailwindDefaults.theme.opacity,
      '1': '0.01',
    },
    placeholderColor: '#C0C4CC',
    spacing: {
      ...tailwindDefaults.theme.spacing,
      auto: 'auto',
    },
    zIndex: {
      ...tailwindDefaults.theme.zIndex,
      '-10': '-10', // Use .-z-10 not .z--10
      '-20': '-20',
    },
  },
  variants: {},
  plugins: [],
  corePlugins: {
    // Disable preflight, as it actively removes parts of the browser stylesheet that existing code relies on,
    // e.g. increased font size & weight on h1, h2, etc. elements.
    // More info: https://tailwindcss.com/docs/preflight/#app
    preflight: false,
  }
}
