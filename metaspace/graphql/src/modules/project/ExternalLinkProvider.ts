
export type ExternalLinkProvider =
  'MetaboLights'
| 'PubMed'
| 'DOI';

export const ExternalLinkProviderOptions: {[K in ExternalLinkProvider]: K} = {
  MetaboLights: 'MetaboLights',
  PubMed: 'PubMed',
  DOI: 'DOI',
};

export const isExternalLinkProvider = (val: any): val is ExternalLinkProvider => {
  return (Object.values(ExternalLinkProviderOptions) as any[]).includes(val);
};

export const ELPO = ExternalLinkProviderOptions;
