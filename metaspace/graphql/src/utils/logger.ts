import * as winston from 'winston'
import * as moment from 'moment'
import config from './config'

const logger = new winston.Logger({
  transports: [
    new winston.transports.Console({
      level: config.log.level,
      timestamp: function() {
        return moment().format('YYYY-MM-DD HH:mm:ss,SSS')
      },
      // formatter: function(options) {
      //   // TODO Lachlan: This custom formatter logs an empty string when given an error
      //   // Copy the default formatter's behavior for when options.message is empty
      //   // Return string will be passed to logger.
      //   return options.timestamp() +' - '+ options.level.toUpperCase() +' - '+ (options.message ? options.message : '') +
      //     (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' );
      // }
    }),
  ],
})

export default logger
