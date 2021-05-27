import config from './config'
import router from '../router'

export default () => {
  try {
    if (config.features.multiple_ion_images) {
      // @ts-ignore
      const { viewId, ds } = router.history.current.query
      if (viewId && ds) {
        return true
      }
    }
    return false
  } catch (e) {
    return false
  }
}
