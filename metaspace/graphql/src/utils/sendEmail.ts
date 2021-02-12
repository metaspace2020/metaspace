import * as AWS from 'aws-sdk'
import config from './config'
import logger from './logger'

let ses : AWS.SES
if (config.aws) {
  ses = new AWS.SES(config.aws)
}

export default (recipient: string, subject: string, text: string) => {
  if (ses === undefined) {
    console.log(`Email not set up. Logging to console.\nTo: ${recipient}\nSubject: ${subject}\n${text}`)
  } else {
    ses.sendEmail({
      Source: 'contact@metaspace2020.eu',
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
