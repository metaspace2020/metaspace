import { ValueTransformer } from 'typeorm/decorator/options/ValueTransformer'
import * as moment from 'moment'
import { Moment } from 'moment'

export class MomentValueTransformer implements ValueTransformer {
  to(value: Moment | null): Date | null {
    // Preserve null -> null, undefined -> undefined
    return value && value.toDate()
  }

  from(value: Date | null): Moment | null {
    // Preserve null -> null, undefined -> undefined
    return value && moment.utc(value)
  }
}
