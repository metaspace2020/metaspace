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
        Body: { Text: { Data: text } },
      },
    }, (err) => {
      if (err) logger.error(`Failed to sent email to ${recipient}: ${err}`)
      else logger.info(`Sent email to ${recipient}`)
    })
  }
}

export const sendRecipientsEmail = (recipients: string[], ccs: string[], subject: string, text: string) => {
  if (ses == null) {
    console.log(`Email not set up. Logging to console.\nTo: ${recipients.join(', ')}\nSubject: ${subject}\n${text}`)
  } else {
    ses.sendEmail({
      Source: 'contact@metaspace2020.org',
      Destination: { ToAddresses: recipients, CcAddresses: ccs },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: text } },
      },
    }, (err) => {
      if (err) logger.error(`Failed to sent email to ${recipients}: ${err}`)
      else logger.info(`Sent email to ${recipients}`)
    })
  }
}
