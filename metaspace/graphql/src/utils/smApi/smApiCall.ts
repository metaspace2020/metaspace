import { Semaphore } from 'await-semaphore'
import fetch from 'node-fetch'
import config from '../config'
import logger from '../logger'
import { UserError } from 'graphql-errors'

/**
 * Semaphore to limit the maximum number of parallel requests to sm-api. Having too many parallel requests can result in
 * running out of file handles.
 * Bottle doesn't handle requests in parallel, so there's no benefit to raising this too high. To make matters worse,
 * with ~8 queued requests, Bottle seems to start working in a FILO-style queue, which can cause earlier requests
 * to be delayed so long that they timeout.
 */
export const smApiSemaphore = new Semaphore(8)

export const smApiJsonPost = async(path: string, requestDoc: any) => {
  return smApiSemaphore.use(async() => {
    const response = await fetch(`http://${config.services.sm_engine_api_host}${path}`, {
      method: 'POST',
      body: JSON.stringify(requestDoc),
      headers: { 'Content-Type': 'application/json' },
    })

    let content
    try {
      content = await response.json()
    } catch (ex) {
      logger.error(ex)
      content = null
    }

    return { response, content }
  })
}

export const smApiJsonGet = async(path: string) => {
  return smApiSemaphore.use(async() => {
    const response = await fetch(`http://${config.services.sm_engine_api_host}${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    })

    let content
    try {
      content = await response.json()
    } catch (ex) {
      logger.error(ex)
      content = null
    }

    if (!response.ok) {
      throw new UserError(`Get request to sm-api failed: ${JSON.stringify(content)}`)
    } else {
      logger.info(`Successful ${path}`)
      return content
    }
  })
}
