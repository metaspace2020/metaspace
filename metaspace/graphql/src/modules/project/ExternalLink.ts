import { UserError } from "graphql-errors";
import { Project } from './model';
import { PublicationStatusOptions as PSO } from './Publishing'

export type ExternalLinkProvider =
  'MetaboLights'
  | 'PubMed'
  | 'DOI';

export const ExternalLinkProviderOptions: { [K in ExternalLinkProvider]: K } = {
  MetaboLights: 'MetaboLights',
  PubMed: 'PubMed',
  DOI: 'DOI',
};

const ELPO = ExternalLinkProviderOptions;

const isExternalLinkProvider = (val: any): val is ExternalLinkProvider => {
  return (Object.values(ELPO) as any[]).includes(val);
};

const DOI_ORG_DOMAIN = 'https://doi.org/'

export const addExternalLink = (
  project: Project,
  provider: string,
  link: string,
  replaceExisting: boolean
): ExternalLink[] => {
  if (!isExternalLinkProvider(provider)) {
    throw new UserError('Invalid provider. Allowed providers are: ' + Object.values(ELPO).join(', '));
  }
  if (link.length > 100) {
    throw new UserError('Link too long');
  }
  if (provider == ELPO.DOI) {
    if (project.publicationStatus !== PSO.PUBLISHED) {
      throw new UserError('Cannot add DOI, project is not published')
    }
    if (!link.startsWith(DOI_ORG_DOMAIN)) {
      throw new UserError(`DOI link must start with "${DOI_ORG_DOMAIN}"`)
    }
  }

  let newLinks = project.externalLinks || [];
  if (replaceExisting) {
    newLinks = newLinks.filter(el => el.provider !== provider || el.link === link);
  }
  if (!newLinks.some(el => el.provider === provider && el.link === link)) {
    newLinks.push({ provider: provider, link: link });
  }
  if (newLinks.length > 100) {
    throw new UserError('Too many links');
  }

  return newLinks;
};

export const removeExternalLink = (
  project: Project,
  provider: string,
  link?: string | null,
): ExternalLink[] => {
  if (!isExternalLinkProvider(provider)) {
    throw new UserError('Invalid provider. Allowed providers are: ' + Object.values(ELPO).join(', '));
  }

  const oldLinks = project.externalLinks
  if (link != null
    && (oldLinks == null || !oldLinks.some(el => el.provider === provider && el.link === link))) {
    throw new UserError('Specified external link does not exist');
  }
  if (link != null) {
    return (oldLinks || []).filter(el => el.provider !== provider || el.link !== link);
  } else {
    return (oldLinks || []).filter(el => el.provider !== provider);
  }
};

export interface ExternalLink {
  provider: ExternalLinkProvider;
  link: string;
}
