import logger from '../../utils/logger'
import sendEmail from '../../utils/sendEmail'

export const sendVerificationEmail = (email: string, link: string) => {
  const subject = 'METASPACE email verification'
  const text =
`Dear METASPACE user,

Please verify this email by following the link ${link}

Best wishes,
METASPACE Team`
  sendEmail(email, subject, text)
  logger.info(`Sent email verification to ${email}`)
}

export const sendLoginEmail = (email: string, link: string) => {
  const subject = 'METASPACE log in'
  const text =
`Dear METASPACE user,

You are already signed up with our service. Please log in using this link ${link}.

Best wishes,
METASPACE Team`
  sendEmail(email, subject, text)
  logger.info(`Email already verified. Sent log in email to ${email}`)
}

export const sendCreateAccountEmail = (email: string, link: string) => {
  const subject = 'METASPACE log in'
  const text =
      `Dear METASPACE user,

You do not have an account with this email address. Please create an account here: ${link}.

Best wishes,
METASPACE Team`
  sendEmail(email, subject, text)
  logger.info(`No account. Sent create account email to ${email}`)
}

export const sendResetPasswordEmail = (email: string, link: string) => {
  const subject = 'METASPACE password reset'
  const text =
`Dear METASPACE user,

You requested password reset. To do so, please follow the link ${link}

Best wishes,
METASPACE Team`
  sendEmail(email, subject, text)
  logger.info(`Sent password reset email to ${email}`)
}

export const sendInvitationEmail = (email: string, invitedBy: string, link: string) => {
  const subject = 'METASPACE invitation'
  const text =
      `Dear future METASPACE user,

You have been invited to METASPACE by ${invitedBy}. Please sign up using this email by following the link ${link}.

Best wishes,
METASPACE Team`
  sendEmail(email, subject, text)
  logger.info(`Invitation email sent to ${email} by ${invitedBy}`)
}
