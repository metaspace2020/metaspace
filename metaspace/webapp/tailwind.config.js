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
    extend: {
      colors: {
        text: 'hsl(208, 61%, 16%)',
        gray: { // greys based on brand colour
          '100': 'hsl(208, 36%, 96%)',
          '200': 'hsl(208, 33%, 89%)',
          '300': 'hsl(208, 31%, 80%)',
          '400': 'hsl(208, 27%, 70%)',
          '500': 'hsl(208, 23%, 60%)',
          '600': 'hsl(208, 22%, 49%)',
          '700': 'hsl(208, 28%, 39%)',
          '800': 'hsl(208, 34%, 30%)',
          '900': 'hsl(208, 39%, 23%)',
        }
      }
    }
  },
  variants: {
    margin: ['last']
  },
  plugins: [],
  corePlugins: {
    // Disable preflight, as it actively removes parts of the browser stylesheet that existing code relies on,
    // e.g. increased font size & weight on h1, h2, etc. elements.
    // More info: https://tailwindcss.com/docs/preflight/#app
    preflight: false,
  }
}
