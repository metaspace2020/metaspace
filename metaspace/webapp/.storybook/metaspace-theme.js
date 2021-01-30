import { create } from '@storybook/theming';
import tailwind from '../tailwind.config'

const { fontFamily } = tailwind.theme
const { colors, textColor } = tailwind.theme.extend

export default create({
  base: 'light',

  colorPrimary: colors.primary,
  colorSecondary: colors.primary,

  // UI
  appBg: colors.gray[100],
  appContentBg: 'white',
  appBorderColor: colors.gray[200],
  appBorderRadius: 4,

  // Typography
  fontBase: fontFamily.sans.join(', '),
  fontCode: 'monospace',

  // Text colors
  textColor: colors.body,
  textMutedColor: colors.gray[700],
  textInverseColor: colors.gray[50],

  // Toolbar default and active colors
  barTextColor: colors.gray[600],
  barSelectedColor: textColor.primary,
  barBg: 'white',

  // Form colors
  inputBg: 'white',
  inputBorder: colors.gray[400],
  inputTextColor: colors.gray[700],
  inputBorderRadius: 4,

  brandTitle: 'METASPACE',
});
