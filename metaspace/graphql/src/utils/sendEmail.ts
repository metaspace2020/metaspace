import * as AWS from 'aws-sdk'
import config from './config'
import logger from './logger'
import * as _ from 'lodash'

let ses : AWS.SES
if (config.aws != null && config.aws.credentials != null) {
  // Deep clone the config object because the `config` package adds a bunch of non-enumerable properties to objects
  // such as 'get', 'set', 'watch', etc., which aws-sdk treats as values, leading to errors.
  // Deep cloning removes the non-enumerable properties.
  ses = new AWS.SES(_.cloneDeep(config.aws))
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
