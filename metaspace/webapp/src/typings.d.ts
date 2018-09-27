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

  interface Features {
    // Unused - leaving this as an example
    // newAuth?: boolean;
  }

  interface ClientConfig {
    graphqlUrl: string | null
    wsGraphqlUrl: string | null

    google_client_id: string

    fineUploader: FineUploaderConfig
    ravenDsn: string | null
    features: Features
  }

  const value: ClientConfig;
  export = value;
}
