
export type DialogType = 'signIn' | 'createAccount' | 'forgotPassword';

export const dialogRoutes: Record<string, string> = {
  signIn: '/account/sign-in',
  createAccount: '/account/create-account',
  forgotPassword: '/account/forgot-password',
}
