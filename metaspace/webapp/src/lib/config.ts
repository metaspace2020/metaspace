/* eslint-disable camelcase */
import { defaultsDeep } from 'lodash-es'
import { getLocalStorage, removeLocalStorage, setLocalStorage } from './localStorage'
import { MAX_MOL_DBS_EXT, MAX_MOL_DBS } from './constants'
const fileConfig = require('../clientConfig.json')

interface Features {
  coloc: boolean;
  enrichment: boolean;
  show_dataset_overview: boolean;
  imzml_browser: boolean;
  detectability: boolean;
  roi: boolean;
  tic: boolean;
  custom_cols: boolean;
  ion_thumbs: boolean;
  off_sample: boolean;
  off_sample_col: boolean; // Not a "feature" - just shows an extra column for debugging
  new_feature_popups: boolean;
  optical_transform: boolean;
  ignore_pixel_aspect_ratio: boolean;
  all_dbs: boolean;
  all_adducts: boolean;
  neutral_losses: boolean;
  neutral_losses_new_ds: boolean; // False prevents neutral losses being set on the first upload
  chem_mods: boolean;
  advanced_ds_config: boolean;
  v2: boolean;
  isomers: boolean;
  isobars: boolean;
  moldb_mgmt: boolean;
  moldb_limit_ext: boolean;
  multiple_ion_images: boolean;
  lock_intensity: boolean;
  lithops: boolean;
  raw_fdr: boolean;
}

interface ClientConfig {
  graphqlUrl: string | null;
  wsGraphqlUrl: string | null;
  companionUrl: string | null;
  imageStorage?: string | null;

  google_client_id: string;

  sentry: null | {
    dsn: string;
    environment?: string;
    release?: string;
  };
  metadataTypes: string[];
  features: Features;
}

const defaultConfig: ClientConfig = {
  graphqlUrl: null,
  wsGraphqlUrl: null,
  companionUrl: null,
  google_client_id: '',
  sentry: null,
  metadataTypes: ['ims'],
  features: {
    coloc: true,
    enrichment: true,
    show_dataset_overview: true,
    imzml_browser: true,
    detectability: true,
    roi: true,
    tic: true,
    custom_cols: true,
    ion_thumbs: true,
    off_sample: true,
    off_sample_col: false,
    new_feature_popups: true,
    optical_transform: true,
    ignore_pixel_aspect_ratio: false,
    all_dbs: false,
    all_adducts: false,
    neutral_losses: false,
    neutral_losses_new_ds: true,
    chem_mods: true,
    advanced_ds_config: false,
    v2: true,
    isomers: true,
    isobars: true,
    moldb_mgmt: true,
    moldb_limit_ext: false,
    multiple_ion_images: true,
    lock_intensity: false,
    lithops: false,
    raw_fdr: false,
  },
}

const FEATURE_STORAGE_KEY = 'featureFlags'

const config = defaultsDeep({}, fileConfig, defaultConfig) as ClientConfig

export const updateConfigFromQueryString = () => {
  if (typeof window !== 'undefined') {
    // hackily parse the querystring because vue-router hasn't initialized yet and IE doesn't support the
    // URLSearchParams class that can do this properly
    const queryStringFeatures = (window.location.search || '')
      .substring(1)
      .split('&')
      .filter(part => part.startsWith('feat='))
      .map(features => features.substring('feat='.length).split(','))
      .reduce((a, b) => a.concat(b), [])

    const overrides: Partial<Features> = {}
    if (queryStringFeatures.includes('reset')) {
      removeLocalStorage(FEATURE_STORAGE_KEY)
    } else {
      Object.assign(overrides, getLocalStorage(FEATURE_STORAGE_KEY))
    }

    queryStringFeatures.forEach(feat => {
      const val = !feat.startsWith('-')
      const key = (val ? feat : feat.substring(1))
      if (key !== 'reset' && key !== 'save') {
        overrides[key as keyof Features] = val
      }
    })

    Object.assign(config.features, overrides)

    if (queryStringFeatures.includes('save')) {
      setLocalStorage(FEATURE_STORAGE_KEY, overrides)
    }
  }
}

export const replaceConfigWithDefaultForTests = () => {
  Object.assign(config, defaultConfig)
}

export default config

interface Limits {
  maxMolDBs: number
}

export const limits : Limits = {
  get maxMolDBs() {
    return config.features.moldb_limit_ext ? MAX_MOL_DBS_EXT : MAX_MOL_DBS
  },
}
