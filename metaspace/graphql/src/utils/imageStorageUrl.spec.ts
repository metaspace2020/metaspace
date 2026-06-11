import { resolveImageUrl } from './imageStorageUrl'
import config from './config'

describe('resolveImageUrl', () => {
  const original = { ...config.imageStorage }
  afterEach(() => { (config as any).imageStorage = { ...original } })

  it('falls back to the stored URL when CloudFront is not configured', () => {
    (config as any).imageStorage = { cloudFrontUrl: '' }
    expect(resolveImageUrl({
      imageType: 'iso', dsId: 'ds1', imageId: 'img1', storedUrl: 'http://minio/old',
    })).toBe('http://minio/old')
  })

  it('builds a CloudFront URL from the id when configured', () => {
    (config as any).imageStorage = { cloudFrontUrl: 'https://cdn.example.com/' }
    expect(resolveImageUrl({
      imageType: 'iso', dsId: 'ds1', imageId: 'img1', storedUrl: 'x',
    })).toBe('https://cdn.example.com/iso/ds1/img1')
  })

  it('builds optical URLs with the right prefix', () => {
    (config as any).imageStorage = { cloudFrontUrl: 'https://cdn.example.com' }
    expect(resolveImageUrl({
      imageType: 'optical', dsId: 'd', imageId: 'i', storedUrl: 'x',
    })).toBe('https://cdn.example.com/optical/d/i')
  })

  it('returns the stored URL (or null) when imageId is missing', () => {
    (config as any).imageStorage = { cloudFrontUrl: 'https://cdn.example.com' }
    expect(resolveImageUrl({
      imageType: 'iso', dsId: 'ds1', imageId: null, storedUrl: null,
    })).toBeNull()
  })
})
