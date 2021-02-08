import { UserError } from 'graphql-errors'
import * as _ from 'lodash'

export interface FieldValidationError {
    field?: string | null
    message: string
}

export const FormValidationErrorsType = 'failed_validation' as const

export default class FormValidationErrors extends UserError {
    type: string
    errors: FieldValidationError[]

    constructor(message: string)
    constructor(field: string, message: string)
    constructor(errors: FieldValidationError[])
    constructor(arg1: FieldValidationError[] | string, arg2?: string) {
      const errors: FieldValidationError[] = _.isArray(arg1)
        ? arg1
        : arg2 !== undefined
          ? [{ field: arg1, message: arg2 }]
          : [{ message: arg1 }]

      super(JSON.stringify({
        type: FormValidationErrorsType,
        errors,
      }))

      this.type = FormValidationErrorsType
      this.errors = errors
      Error.captureStackTrace(this, FormValidationErrors)
    }
}
