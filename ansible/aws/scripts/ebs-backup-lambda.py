import boto3
import collections
import datetime
import os
from itertools import chain

aws_sns_arn = os.getenv('aws_sns_arn', None)
aws_regions = ['eu-west-1']


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


def get_tag_value(instance, name, default, func=None):
    v_type = type(default)
    f = func or v_type
    try:
        res = [f(t.get('Value')) for t in instance['Tags'] if t['Key'] == name][0]
    except IndexError:
        res = default
    return res


def backup_region(ec2, region, today):
    print('Today is {} / {}'.format(today, today.strftime('%A')))
    reservations = ec2.describe_instances(
        Filters=[{'Name': 'tag-key', 'Values': ['backup', 'Backup']}]
    ).get('Reservations', [])

    instances = sum([[i for i in r['Instances']] for r in reservations], [])

    print("Found %d instances that need backing up in region %s" % (len(instances), region))

    to_tag_retention = collections.defaultdict(list)
    to_tag_mount_point = collections.defaultdict(list)

    for instance in instances:
        if today.day == 1:
            # keep snapshots taken on the first day of month
            retention_days = get_tag_value(instance, 'retention_monthly', default=180)
        elif today.strftime('%A') == 'Sunday':
            # keep snapshots taken on Sunday for 'retention_weekly' days
            retention_days = get_tag_value(instance, 'retention_weekly', default=7)
        else:
            # keep all other snapshots for 'retention_daily' days
            retention_days = get_tag_value(instance, 'retention_daily', default=2)
        backup_instance(ec2, instance, retention_days, to_tag_retention, to_tag_mount_point)

    for retention_days in to_tag_retention.keys():
        delete_date = today + datetime.timedelta(days=retention_days)
        delete_fmt = delete_date.strftime('%Y-%m-%d')
        print(
            "Will delete %d snapshots on %s" % (len(to_tag_retention[retention_days]), delete_fmt)
        )
        ec2.create_tags(
            Resources=to_tag_retention[retention_days],
            Tags=[{'Key': 'delete_on', 'Value': delete_fmt}],
        )

    message = "{} instances have been backed up in region {}".format(len(instances), region)
    send_to_sns('EBS Backups', message)


def backup_instance(ec2, instance, retention_days, to_tag_retention, to_tag_mount_point):
    skip_volumes = get_tag_value(
        instance, 'skip_backup_volumes', default=[], func=lambda v: str(v).split(',')
    )
    skip_volumes_list = list(chain.from_iterable(skip_volumes))
    inst_name = get_tag_value(instance, 'Name', default='')

    for dev in instance['BlockDeviceMappings']:
        if dev.get('Ebs', None) is None:
            continue
        vol_id = dev['Ebs']['VolumeId']
        if vol_id in skip_volumes_list:
            print("Volume %s is set to be skipped, not backing up" % (vol_id))
            continue
        dev_attachment = dev['DeviceName']
        print(
            "Found EBS volume %s on instance %s attached to %s"
            % (vol_id, instance['InstanceId'], dev_attachment)
        )

        snap = ec2.create_snapshot(VolumeId=vol_id, Description=instance['InstanceId'])

        to_tag_retention[retention_days].append(snap['SnapshotId'])
        to_tag_mount_point[vol_id].append(snap['SnapshotId'])

        print(
            "Retaining snapshot %s of volume %s from instance %s for %d days"
            % (snap['SnapshotId'], vol_id, instance['InstanceId'], retention_days)
        )

        ec2.create_tags(
            Resources=to_tag_mount_point[vol_id], Tags=[{'Key': 'Name', 'Value': inst_name}]
        )


def lambda_handler(event, context):
    print("Backing up instances in regions: %s" % aws_regions)

    for region in aws_regions:
        ec2 = boto3.client('ec2', region_name=region)
        backup_region(ec2, region, datetime.date.today())


if __name__ == '__main__':
    from botocore.stub import Stubber

    ec2 = boto3.client('ec2', region_name='eu-west-1')
    stubber = Stubber(ec2)

    def init_stubber(stubber):
        input_args = dict(Filters=[{'Name': 'tag-key', 'Values': ['backup', 'Backup']}])
        import test_responses as resp

        stubber.add_response('describe_instances', resp.describe_instances, input_args)
        stubber.add_response('create_snapshot', {'SnapshotId': '42'})
        stubber.add_response('create_tags', {})
        stubber.add_response('create_tags', {})

    with Stubber(ec2) as stubber:
        init_stubber(stubber)
        backup_region(ec2, 'eu-west-1', datetime.date(2017, 9, 3))  # Sunday
        init_stubber(stubber)
        backup_region(ec2, 'eu-west-1', datetime.date(2017, 8, 30))  # Wednesday

    # backup_region(ec2, 'eu-west-1', datetime.date(2017, 9, 3))
