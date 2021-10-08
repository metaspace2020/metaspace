const defaults = require('tailwindcss/defaultConfig.js')

module.exports = {
  // Reference: https://tailwindcss.com/docs/configuration
  // Defaults: https://github.com/tailwindcss/tailwindcss/blob/master/stubs/defaultConfig.stub.js
  theme: {
    fontFamily: {
      sans: ['Roboto', 'SUPERSCIPT_OVERRIDE', 'Helvetica', 'Arial', 'sans-serif'],
      display: ['FuturaBT-Medium', 'Roboto', 'Helvetica', 'Arial', 'sans-serif']
    },
    placeholderColor: {
      default: theme => theme('colors.gray.500')
    },
    maxHeight: {
      full: '100%',
      screen: '100vh',
      '25': '6.25rem',
    },
    extend: {
      colors: {
        // brand
        primary: 'hsl(208, 87%, 50%)',
        // states
        'success': '#2CBA8F',
        'warning': '#E6A23C',
        'danger': '#F56C6C',
        // UI
        body: 'hsl(208, 61%, 16%)',
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
        },
        blue: { // experimental, could merge with brand
          '100': 'hsl(208, 79%, 92%)',
          '200': 'hsl(208, 97%, 85%)',
          '300': 'hsl(208, 84%, 74%)',
          '400': 'hsl(208, 74%, 65%)',
          '500': 'hsl(208, 65%, 55%)',
          '600': 'hsl(208, 67%, 45%)',
          '700': 'hsl(208, 76%, 39%)',
          '800': 'hsl(208, 82%, 33%)',
          '900': 'hsl(208, 87%, 29%)',
          '999': 'hsl(208, 100%, 21%)',
        }
      },
      textColor: {
        primary: 'hsl(208, 93%, 44%)',
        danger: defaults.theme.colors.red[700],
      },
      borderColor: {
        danger: defaults.theme.colors.red[700],
        'gray-200-alpha': 'hsla(208, 33%, 89%, 87%)'
      },
      backgroundColor: {
        'primary-alpha': 'hsla(208, 87%, 50%, 87%)',
        'blue-100-alpha': 'hsla(208, 79%, 92%, 87%)',
        'blue-200-alpha': 'hsla(208, 97%, 85%, 87%)',
        'blue-700-alpha': 'hsla(208, 76%, 39%, 75%)',
        'gray-100-alpha': 'hsla(208, 36%, 96%, 87%)',
        'gray-200-alpha': 'hsla(208, 33%, 89%, 87%)'
      },
      inset: {
        '1/2': '50%',
      },
      opacity: {
        '1': '0.01',
      },
      spacing: {
        auto: 'auto',
        '9': '2.25rem', // 1.5 * 24px/1.5rem
        '18': '4.5rem', // 3 * 24px/1.5rem
        '21': '5.25rem', // 3.5 * 24px/1.5rem
        '60': '15rem', // 10 * 24px/1.5rem
        '66': '16.5rem', // 11 * 24px/1.5rem
      },
      maxWidth: {
        'measure-1': '44ch',
        'measure-2': '52ch',
        'measure-3': '60ch',
        'measure-4': '68ch',
        'measure-5': '76ch',
      },
      zIndex: {
        '-10': '-10', // Use .-z-10 not .z--10
        '-20': '-20',
      },
      lineHeight: {
        '12': '3rem', // 2 * 24px/1.5rem
      },
      letterSpacing: {
        'snug': '-0.0125em',
      },
    }
  },
  variants: {
    borderColor: [...defaults.variants.borderColor, 'focus-within'],
    margin: [...defaults.variants.margin, 'last'],
  },
  plugins: [],
  corePlugins: {
    // Disable preflight, as it actively removes parts of the browser stylesheet that existing code relies on,
    // e.g. increased font size & weight on h1, h2, etc. elements.
    // More info: https://tailwindcss.com/docs/preflight/#app
    preflight: false,
  }
}
