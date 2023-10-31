import { onError } from '@apollo/client/link/error'
import { setContext } from '@apollo/client/link/context'
import { get } from 'lodash-es'
import config from '../lib/config'
import { makeApolloCache } from '../lib/apolloCache'
import tokenAutorefresh from './tokenAutorefresh'
import reportError from '../lib/reportError'

import { ApolloClient } from '@apollo/client/core'
// import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { WebSocketLink } from '@apollo/client/link/ws' // TODO: Update once the graphql is updated
import { BatchHttpLink } from '@apollo/client/link/batch-http'
import { SubscriptionClient } from 'subscriptions-transport-ws'

import { getMainDefinition } from '@apollo/client/utilities'
import { split } from '@apollo/client/core'

const errorLink: any = onError(({ graphQLErrors, networkError, forward, operation }) => {
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

const isReadOnlyError = (error: any) => {
  try {
    return JSON.parse(error.message).type === 'read_only_mode'
  } catch {
    return false
  }
}

const authLink = setContext(async() => {
  try {
    return {
      headers: {
        authorization: `Bearer ${await tokenAutorefresh.getJwt()}`,
      },
    }
  } catch (err) {
    reportError(err)
    throw err
  }
}) // Adjust this if needed

let $alert: ((message: string, title: string, options?: any) => Promise<any>) | null = null

export function setMaintenanceMessageHandler(_$alert: (message: string, title: string, options?: any) => Promise<any>) {
  console.log('$alert', $alert)
  $alert = _$alert
}

const graphqlUrl = config.graphqlUrl || `${window.location.origin}/graphql`
const wsGraphqlUrl = config.wsGraphqlUrl || `${window.location.origin.replace(/^http/, 'ws')}/ws`

const httpLink = new BatchHttpLink({
  uri: graphqlUrl,
  batchInterval: 10,
})
const wsClient = new SubscriptionClient(wsGraphqlUrl, {
  reconnect: true,
  async connectionParams() {
    console.log('wsClient', wsClient)
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
  // eslint-disable-next-line @typescript-eslint/ban-types
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

const link = errorLink.concat(authLink).concat(split(
  ({ query }) => {
    console.log('man', query)
    const def = getMainDefinition(query)
    return (
      def.kind === 'OperationDefinition'
      && def.operation === 'subscription'
    )
  },
  wsLink,
  httpLink,
))

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

  await apolloClient.clearStore()
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
