import * as AWS from 'aws-sdk';

import config from '../../utils/config';
import {logger} from '../../utils';

AWS.config.update({
  accessKeyId: config.aws.aws_access_key_id,
  secretAccessKey: config.aws.aws_secret_access_key,
  region: config.aws.aws_region
});

const ses = new AWS.SES();

const sendEmail = (recipient: string, subject: string, text: string) => {
  ses.sendEmail({
    Source: 'contact@metaspace2020.eu',
    Destination: { ToAddresses: [recipient] },
    Message: {
      Subject: { Data: subject },
      Body: { Text: { Data: text } }
    }
  }, (err, data) => {
    if (err) logger.error(`Failed to sent email to ${recipient}: ${err}`);
    else logger.log(`Sent email to ${recipient}`);
  });
};

export const sendVerificationEmail = (email: string, link: string) => {
  const subject = 'METASPACE email verification',
    text =
`Dear METASPACE user,

please verify this email by clicking the link ${link}

Best wishes,
METASPACE Team`;
  sendEmail(email, subject, text);
};

export const sendLoginEmail = (email: string) => {
  const subject = 'METASPACE log in',
    text =
`Dear METASPACE user,

you are already signed up with our service. Please log in using this email.

Best wishes,
METASPACE Team`;
  sendEmail(email, subject, text);
};

export const sendResetPasswordEmail = (email: string, link: string) => {
  const subject = 'METASPACE password reset',
    text =
`Dear METASPACE user,

You requested password reset. To do so, please follow the link ${link}

Best wishes,
METASPACE Team`;
  sendEmail(email, subject, text);
};