import os

import boto3


# pylint: disable=invalid-name
if __name__ == '__main__':
    print(
        'Credentials of the root account should be used to enable MFA-delete on versioned buckets'
    )

    os.environ['AWS_ACCESS_KEY_ID'] = input('Enter your AWS_ACCESS_KEY_ID: ')
    os.environ['AWS_SECRET_ACCESS_KEY'] = input('Enter your AWS_SECRET_ACCESS_KEY: ')

    bucket_names = input(
        'Enter names of the buckets that you want to enable MFA-delete on, separated by space: '
    ).split(' ')
    serial_number = input('Enter your MFA serial number: ')
    token_code = input('Enter the MFA token code: ')

    s3_client = boto3.client('s3')

    for bucket_name in bucket_names:
        print(f'Enabling versioning for the "{bucket_name}" bucket')
        s3_client.put_bucket_versioning(
            Bucket=bucket_name,
            MFA=f'{serial_number} {token_code}',
            VersioningConfiguration={'MFADelete': 'Enabled', 'Status': 'Enabled'},
        )
