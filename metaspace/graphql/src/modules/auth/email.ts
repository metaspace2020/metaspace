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
  if (process.env.NODE_ENV === 'development' && !config.aws.aws_access_key_id && !config.aws.aws_secret_access_key) {
    console.log(`Email not set up. Logging to console.\nTo: ${recipient}\nSubject: ${subject}\n${text}`)
  } else {
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
  }
};

export const sendVerificationEmail = (email: string, link: string) => {
  const subject = 'METASPACE email verification',
    text =
`Dear METASPACE user,

Please verify this email by following the link ${link}

Best wishes,
METASPACE Team`;
  sendEmail(email, subject, text);
  logger.info(`Sent email verification to ${email}`);
};

export const sendLoginEmail = (email: string, link: string) => {
  const subject = 'METASPACE log in',
    text =
`Dear METASPACE user,

You are already signed up with our service. Please log in using this link ${link}.

Best wishes,
METASPACE Team`;
  sendEmail(email, subject, text);
  logger.info(`Email already verified. Sent log in email to ${email}`);
};

export const sendResetPasswordEmail = (email: string, link: string) => {
  const subject = 'METASPACE password reset',
    text =
`Dear METASPACE user,

You requested password reset. To do so, please follow the link ${link}

Best wishes,
METASPACE Team`;
  sendEmail(email, subject, text);
  logger.info(`Sent password reset email to ${email}`);
};

export const sendInvitationEmail = (email: string, invitedBy: string, link: string) => {
  const subject = 'METASPACE invitation',
    text =
      `Dear future METASPACE user,

You have been invited to METASPACE by ${invitedBy}. Please sign up using this email by following the link ${link}.

Best wishes,
METASPACE Team`;
  sendEmail(email, subject, text);
  logger.info(`${invitedBy} invited user ${email}`);
};
