declare module "*/clientConfig.json" {
  interface AWSConfig {
    access_key_id: string
    region: string
    s3_bucket: string
    s3_signature_endpoint: string
    s3_signature_version: number
  }

  interface FineUploaderConfig {
    storage: 's3' | 'local'
    aws: AWSConfig
  }

  interface ClientConfig {
    graphqlUrl: string | null
    wsGraphqlUrl: string | null

    google_client_id: string
    enableUploads: boolean

    fineUploader: FineUploaderConfig
    ravenDsn: string | null
  }

  const value: ClientConfig;
  export = value;
}
