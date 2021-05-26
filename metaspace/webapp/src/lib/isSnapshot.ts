import config from './config'
import store from '../store'

export default () => {
  try {
    if (config.features.multiple_ion_images) {
      // @ts-ignore
      const { viewId, ds } = store.state.route.query
      if (viewId && ds) {
        return true
      }
    }
    return false
  } catch (e) {
    return false
  }
}
