import logger from './logger'
import { getSESClient } from './awsClient'

const ses = getSESClient()

export default (recipient: string, subject: string, text: string) => {
  if (ses == null) {
    console.log(`Email not set up. Logging to console.\nTo: ${recipient}\nSubject: ${subject}\n${text}`)
  } else {
    ses.sendEmail({
      Source: 'contact@metaspace2020.org',
      Destination: { ToAddresses: [recipient] },
      Message: {
        Subject: { Data: subject },
        Body: { Html: { Data: text } },
      },
    }, (err) => {
      if (err) logger.error(`Failed to sent email to ${recipient}: ${err}`)
      else logger.info(`Sent email to ${recipient}`)
    })
  }
}

const CONTACT_CONFIRMATION = 'We have received your contact message and will '
  + ' get back to you as soon as possible.\n\nMETASPACE team'

/** Sends `text` to the recipients, and a plain-text confirmation to the sender (`email`). */
export const sendRecipientsEmail = (recipients: string[], ccs: string[],
  subject: string, text: string, email: string,
  confirmation: { subject: string, text: string } = { subject, text: CONTACT_CONFIRMATION }) => {
  if (ses == null) {
    console.log(`Email not set up. Logging to console.\nTo: ${recipients.join(', ')}\nSubject: ${subject}\n${text}`)
  } else {
    ses.sendEmail({
      Source: 'contact@metaspace2020.org',
      Destination: { ToAddresses: recipients, CcAddresses: ccs },
      Message: {
        Subject: { Data: subject },
        Body: { Html: { Data: text } },
      },
    }, (err) => {
      if (err) logger.error(`Failed to sent email to ${recipients}: ${err}`)
      else logger.info(`Sent email to ${recipients}`)
    })

    ses.sendEmail({
      Source: 'contact@metaspace2020.org',
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: confirmation.subject },
        Body: { Text: { Data: confirmation.text } },
      },
    }, (err) => {
      if (err) logger.error(`Failed to sent email to ${email}: ${err}`)
      else logger.info(`Sent email to ${email}`)
    })
  }
}
