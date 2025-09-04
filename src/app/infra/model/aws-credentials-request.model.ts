export interface AwsCredentialsRequest {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken?: string;
}
