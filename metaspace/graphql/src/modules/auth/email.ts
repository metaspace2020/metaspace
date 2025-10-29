import config from '../../utils/config'
import logger from '../../utils/logger'
import sendEmail, { sendRecipientsEmail } from '../../utils/sendEmail'

export const sendWelcomeEmail = (email: string, name: string) => {
  const subject = 'Welcome to METASPACE – Here’s What You Need to Know!'
  const text =
`Dear ${name}

Welcome to METASPACE! We're thrilled to have you join our community. Here's 
everything you need to know to get started and make the most of your experience:

<h3>1. About METASPACE!</h3>

METASPACE is the cloud computing engine for annotating metabolites, lipids, and glycans in 
imaging mass spectrometry data, and hosts a knowledgebase of over 13.000 public annotated 
datasets from over 200 labs. METASPACE 
is proudly maintained by the <a href="https://ateam.ucsd.edu/">Alexandrov team at UCSD</a>.

<h3>2. Explore How-to Video Guides</h3>

Along with the comprehensive <a href="https://metaspace2020.eu/help">help page</a> on 
METASPACE that covers everything you need to get started, we've also 
created a series of helpful how-to video guides. You can explore 
the playlist 
<a href="https://www.youtube.com/@METASPACE2020/videos">
here</a>. While the collection is new, we'll be adding fresh guides regularly, so
 be sure to check back for the latest additions!

<h3>3. Stay Connected</h3>

As METASPACE continues to grow, we've expanded our presence across various social
 media platforms. Stay up to date and engage with us through

LinkedIn: <a href="https://www.linkedin.com/company/metaspace-imaging-ms">
https://www.linkedin.com/company/metaspace-imaging-ms</a><br>
X: <a href="https://twitter.com/metaspace2020">@metaspace2020</a><br>
BlueSky: <a href="https://bsky.app/profile/metaspace2020.bsky.social">@metaspace2020</a><br>
YouTube: <a href="https://www.youtube.com/@METASPACE2020">https://www.youtube.com/@METASPACE2020</a><br>
Community Discussion: Join the conversation and ask questions on our GitHub
 page <a href="https://github.com/metaspace2020/metaspace/discussions">here</a>.

<h3>4. Stay Updated with Our Newsletter</h3>

We know you don't want your inbox flooded with unnecessary emails. That's why we 
promise not to spam you! If you want to receive regular updates about METASPACE, please 
sign up for our newsletter <a href="https://metaspace2020.org/">here</a>.

If you prefer to receive only essential updates, rest assured that you will only hear 
from us in the event of critical changes or major announcements—no spam, just important information!

We truly appreciate your continued support and look forward to staying connected!

Best regards,
METASPACE Team`
  sendEmail(email, subject, text)
  logger.info(`Sent welcome email to ${email}`)
}

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

export const sendContactEmail = (email: string, name: string, category: string, message: string) => {
  const subject = `METASPACE contact [${category}]`
  let text = ''
  let recipients = [config.contact.email]
  let ccs = [config.contact.email]
  if (category === 'scientific') {
    text =
`The user ${name} with email ${email} has sent a scientific support message with message ${message}.`
    recipients = [config.contact.sci_email]
  } else if (category === 'software' || category === 'bug' || category === 'feature' || category === 'pro') {
    text =
`The user ${name} with email ${email} has sent a ${category} support message with message ${message}.`
    recipients = [config.contact.tech_email]
  } else {
    text =
`The user ${name} with email ${email} has sent a contact message with message ${message}.`
    ccs = []
  }

  sendRecipientsEmail(recipients, ccs, subject, text, email)
  logger.info(`Sent contact email to ${recipients.join(', ')}`)
}
