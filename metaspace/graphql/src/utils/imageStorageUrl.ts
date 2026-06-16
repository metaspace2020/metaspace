import config from './config'

export type StoredImageType = 'iso' | 'optical' | 'thumb' | 'raw_optical' | 'diag'

interface ResolveImageUrlArgs {
  imageType: StoredImageType;
  dsId: string;
  imageId: string | null | undefined;
  storedUrl: string | null | undefined;
}

export const resolveImageUrl = (
  { imageType, dsId, imageId, storedUrl }: ResolveImageUrlArgs
): string | null => {
  const cfg = config.imageStorage
  // Local dev / MinIO / tests: no CloudFront → keep returning the stored URL.
  if (!cfg || !cfg.cloudFrontUrl || !imageId) {
    return storedUrl ?? null
  }
  const base = cfg.cloudFrontUrl.replace(/\/+$/, '')
  return `${base}/${imageType}/${dsId}/${imageId}`
}
