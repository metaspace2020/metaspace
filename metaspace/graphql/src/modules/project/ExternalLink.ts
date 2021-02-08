import { UserError } from 'graphql-errors'

export type ExternalLinkProvider =
  'MetaboLights'
  | 'PubMed'
  | 'DOI';

export const ExternalLinkProviderOptions: { [K in ExternalLinkProvider]: K } = {
  MetaboLights: 'MetaboLights',
  PubMed: 'PubMed',
  DOI: 'DOI',
}

const ELPO = ExternalLinkProviderOptions

const isExternalLinkProvider = (val: any): val is ExternalLinkProvider => {
  return (Object.values(ELPO) as any[]).includes(val)
}

const DOI_ORG_DOMAIN = 'https://doi.org/'

export const addExternalLink = (
  oldLinks: ExternalLink[] | null,
  provider: string,
  link: string,
  replaceExisting: boolean
): ExternalLink[] => {
  if (!isExternalLinkProvider(provider)) {
    throw new UserError('Invalid provider. Allowed providers are: ' + Object.values(ELPO).join(', '))
  }
  if (link.length > 100) {
    throw new UserError('Link too long')
  }
  if (provider === ELPO.DOI && !link.startsWith(DOI_ORG_DOMAIN)) {
    throw new UserError(`DOI link should start with "${DOI_ORG_DOMAIN}"`)
  }

  let newLinks = oldLinks || []
  if (replaceExisting) {
    newLinks = newLinks.filter(el => el.provider !== provider || el.link === link)
  }
  if (!newLinks.some(el => el.provider === provider && el.link === link)) {
    newLinks.push({ provider: provider, link: link })
  }
  if (newLinks.length > 100) {
    throw new UserError('Too many links')
  }

  return newLinks
}

export const removeExternalLink = (
  oldLinks: ExternalLink[] | null,
  provider: string,
  link?: string | null,
): ExternalLink[] => {
  if (!isExternalLinkProvider(provider)) {
    throw new UserError('Invalid provider. Allowed providers are: ' + Object.values(ELPO).join(', '))
  }
  if (link != null
    && (oldLinks == null || !oldLinks.some(el => el.provider === provider && el.link === link))) {
    throw new UserError('Specified external link does not exist')
  }

  if (link != null) {
    return (oldLinks || []).filter(el => el.provider !== provider || el.link !== link)
  } else {
    return (oldLinks || []).filter(el => el.provider !== provider)
  }
}

export interface ExternalLink {
  provider: ExternalLinkProvider;
  link: string;
}
