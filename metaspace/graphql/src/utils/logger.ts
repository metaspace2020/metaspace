import * as winston from 'winston'
import * as moment from 'moment'
import config from './config'

interface CustomInfo extends winston.Logform.TransformableInfo {
  timestamp?: string;
}

const customFormat = winston.format.printf(({
  level,
  message, timestamp, ...meta
}: CustomInfo) => {
  return `${timestamp} - ${level.toUpperCase()} - ${message} ${Object.keys(meta).length
? '\n\t' + JSON.stringify(meta)
      : ''}`
})

const logger = winston.createLogger({
  level: config.log.level, // Log level from config
  format: winston.format.combine(
    winston.format.timestamp({
      format: () => moment().format('YYYY-MM-DD HH:mm:ss,SSS'), // custom timestamp format
    }),
    customFormat
  ),
  transports: [
    new winston.transports.Console(),
  ],
})

export default logger
