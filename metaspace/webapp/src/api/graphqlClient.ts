import { ApolloClient } from 'apollo-client-preset'
import { BatchHttpLink } from 'apollo-link-batch-http'
import { WebSocketLink } from 'apollo-link-ws'
import { setContext } from 'apollo-link-context'
import { SubscriptionClient } from 'subscriptions-transport-ws'
import { getOperationAST } from 'graphql/utilities/getOperationAST'
import { onError } from 'apollo-link-error'

import config from '../lib/config'
import tokenAutorefresh from './tokenAutorefresh'
import reportError from '../lib/reportError'
import { get } from 'lodash-es'
import { makeApolloCache } from '../lib/apolloCache'

const graphqlUrl = config.graphqlUrl || `${window.location.origin}/graphql`
const wsGraphqlUrl = config.wsGraphqlUrl || `${window.location.origin.replace(/^http/, 'ws')}/ws`

let $alert: ((message: string, title: string, options?: any) => Promise<any>) | null = null

export function setMaintenanceMessageHandler(_$alert: (message: string, title: string, options?: any) => Promise<any>) {
  $alert = _$alert
}

const isReadOnlyError = (error: any) => {
  try {
    return JSON.parse(error.message).type === 'read_only_mode'
  } catch {
    return false
  }
}

const authLink = setContext(async() => {
  try {
    return ({
      headers: {
        authorization: `Bearer ${await tokenAutorefresh.getJwt()}`,
      },
    })
  } catch (err) {
    reportError(err)
    throw err
  }
})

const errorLink = onError(({ graphQLErrors, networkError, forward, operation }) => {
  if (graphQLErrors) {
    const readOnlyErrors = graphQLErrors.filter(isReadOnlyError)

    if (readOnlyErrors.length > 0) {
      if ($alert != null) {
        readOnlyErrors.forEach(err => { (err as any).isHandled = true })
        $alert('This operation could not be completed. '
          + 'METASPACE is currently in read-only mode for scheduled maintenance. Please try again later.',
        'Scheduled Maintenance',
        { type: 'error' })
          .catch(() => { /* Ignore exception raised when alert is closed */ })
      }
    }
  } else if (networkError) {
    const message = get(networkError, 'result.message')
    if (message === 'jwt expired') {
      // noinspection JSIgnoredPromiseFromCall
      tokenAutorefresh.refreshJwt(true)
      return forward(operation)
    }
  }
})

const httpLink = new BatchHttpLink({
  uri: graphqlUrl,
  batchInterval: 10,
})

const wsClient = new SubscriptionClient(wsGraphqlUrl, {
  reconnect: true,
  async connectionParams() {
    // WORKAROUND: This is not the right place for this, but it's the only callback that gets called after a reconnect
    // and can run an async operation before any messages are sent.
    // All subscription operations need to have their JWTs updated before they are reconnected, so do that before
    // supplying the connection params.
    const operations = Object.values(wsClient.operations || {}).map(op => op.options)
    // @ts-ignore the private unsentMessagesQueue
    const queuedMessages: any[] = wsClient.unsentMessagesQueue.map((m: any) => m.payload)
    const payloads = [...operations, ...queuedMessages]

    if (payloads.length > 0) {
      const jwt = await tokenAutorefresh.getJwt()
      payloads.forEach(payload => {
        payload.jwt = jwt
      })
    }

    return {}
  },
})
wsClient.use([{
  async applyMiddleware(operationOptions: any, next: Function) {
    // Attach a JWT to each request
    try {
      operationOptions.jwt = await tokenAutorefresh.getJwt()
    } catch (err) {
      reportError(err)
      next(err)
    } finally {
      next()
    }
  },
}])

const wsLink = new WebSocketLink(wsClient)

const link = errorLink.concat(authLink).split(
  (operation) => {
    // Only send subscriptions over websockets
    const operationAST = getOperationAST(operation.query, operation.operationName)
    return operationAST != null && operationAST.operation === 'subscription'
  },
  wsLink,
  httpLink,
)

const apolloClient = new ApolloClient({
  link,
  cache: makeApolloCache(),
  defaultOptions: {
    query: {
      fetchPolicy: 'network-only',
    },
  },
})

export const refreshLoginStatus = async() => {
  // Problem: `refreshJwt` updates the Vuex store, which sometimes immediately triggers new queries.
  // `apolloClient.resetStore()` has an error if there are any in-flight queries, so it's not suitable to run it
  // immediately after `refreshJwt`.
  // Solution: Split the `resetStore` into two parts: invalidate old data before `refreshJwt` updates Vuex,
  // then ensure that all queries are refetched.

  await apolloClient.queryManager.clearStore()
  await tokenAutorefresh.refreshJwt(true)

  try {
    await apolloClient.reFetchObservableQueries()
  } catch (err) {
    // reFetchObservableQueries throws an error if any queries fail.
    // Let the source of the query handle it instead of breaking `refreshLoginStatus`.
    console.error(err)
  }
}

export default apolloClient
