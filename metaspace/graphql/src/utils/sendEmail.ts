import * as AWS from 'aws-sdk'
import config from './config'
import logger from './logger'

AWS.config.update({
  accessKeyId: config.aws.aws_access_key_id,
  secretAccessKey: config.aws.aws_secret_access_key,
  region: config.aws.aws_region,
})

const ses = new AWS.SES()

export default (recipient: string, subject: string, text: string) => {
  if (process.env.NODE_ENV === 'development' && !config.aws.aws_access_key_id && !config.aws.aws_secret_access_key) {
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
