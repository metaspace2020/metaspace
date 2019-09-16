import boto3
import datetime
import os
import re

aws_regions = ['eu-west-1']
aws_sns_arn = os.getenv('aws_sns_arn', None)


def send_to_sns(subject, message):
    if aws_sns_arn is None:
        return

    print("Sending notification to: %s" % aws_sns_arn)

    client = boto3.client('sns')

    response = client.publish(TargetArn=aws_sns_arn, Message=message, Subject=subject)

    if 'MessageId' in response:
        print("Notification sent with message id: %s" % response['MessageId'])
    else:
        print("Sending notification failed with response: %s" % str(response))


def cleanup_region(ec2, account_ids, region, today):
    print('Today is {} / {}'.format(today, today.strftime('%A')))

    delete_on = today.strftime('%Y-%m-%d')
    filters = [
        {'Name': 'tag-key', 'Values': ['delete_on']},
        {'Name': 'tag-value', 'Values': [delete_on]},
    ]
    snapshot_response = ec2.describe_snapshots(OwnerIds=account_ids, Filters=filters)

    print(
        "Found %d snapshot(s) that need(s) deleting in region %s on %s"
        % (len(snapshot_response['Snapshots']), region, delete_on)
    )

    for snap in snapshot_response['Snapshots']:
        print("Deleting snapshot %s" % snap['SnapshotId'])
        ec2.delete_snapshot(SnapshotId=snap['SnapshotId'])

    message = "{} snapshots have been cleaned up in region {}".format(
        len(snapshot_response['Snapshots']), region
    )
    send_to_sns('EBS Backups Cleanup', message)


def get_account_id(iam):
    try:
        """
        You can replace this try/except by filling in `account_ids` yourself.
        Get your account ID with:
        > import boto3
        > iam = boto3.client('iam')
        > print iam.get_user()['User']['Arn'].split(':')[4]
        """
        return iam.get_user()['User']['Arn'].split(':')[4]
    except Exception as e:
        # use the exception message to get the account ID the function executes under
        return re.search(r'(arn:aws:sts::)([0-9]+)', str(e)).groups()[1]


def lambda_handler(event, context):
    """
    This function looks at *all* snapshots that have a "delete_on" tag containing
    the current day formatted as YYYY-MM-DD. This function should be run at least
    daily.
    """
    print("Cleaning up snapshots in regions: %s" % aws_regions)

    for region in aws_regions:
        ec2 = boto3.client('ec2', region_name=region)
        account_id = get_account_id(boto3.client('iam'))
        cleanup_region(
            ec2=ec2, account_ids=[account_id], region=region, today=datetime.date.today()
        )


if __name__ == '__main__':
    from botocore.stub import Stubber

    ec2 = boto3.client('ec2', region_name='eu-west-1')
    stubber = Stubber(ec2)

    def init_stubber(stubber, delete_on):
        import test_responses as resp

        stubber.add_response(
            'describe_snapshots',
            resp.describe_snapshots,
            {
                'OwnerIds': [''],
                'Filters': [
                    {'Name': 'tag-key', 'Values': ['delete_on']},
                    {'Name': 'tag-value', 'Values': [delete_on]},
                ],
            },
        )
        stubber.add_response('delete_snapshot', {})

    with Stubber(ec2) as stubber:
        init_stubber(stubber, '2017-09-03')
        account_id = get_account_id(boto3.client('iam'))
        cleanup_region(
            ec2=ec2, account_ids=[account_id], region='eu-west-1', today=datetime.date(2017, 9, 3)
        )

    # cleanup_region(ec2, 'eu-west-1', datetime.date(2017, 9, 3))
