import datetime
from dateutil.tz import tzutc

describe_instances = {
    'Reservations': [
        {
            'Groups': [],
            'Instances': [
                {
                    'AmiLaunchIndex': 0,
                    'ImageId': 'ami-id',
                    'InstanceId': 'i-id',
                    'InstanceType': 't2.medium',
                    'KeyName': 'key_name',
                    'LaunchTime': datetime.datetime(2016, 12, 6, 16, 9, 59, tzinfo=tzutc()),
                    'Monitoring': {'State': 'disabled'},
                    'Placement': {
                        'AvailabilityZone': 'eu-west-1c',
                        'GroupName': '',
                        'Tenancy': 'default',
                    },
                    'PrivateDnsName': 'ip-X.X.X.X.eu-west-1.compute.internal',
                    'PrivateIpAddress': 'X.X.X.X',
                    'ProductCodes': [],
                    'PublicDnsName': 'ec2-X.X.X.X.eu-west-1.compute.amazonaws.com',
                    'PublicIpAddress': 'X.X.X.X',
                    'State': {'Code': 16, 'Name': 'running'},
                    'StateTransitionReason': '',
                    'SubnetId': 'subnet-id',
                    'VpcId': 'vpc-id',
                    'Architecture': 'x86_64',
                    'BlockDeviceMappings': [
                        {
                            'DeviceName': '/dev/sda1',
                            'Ebs': {
                                'AttachTime': datetime.datetime(
                                    2016, 12, 6, 16, 9, 59, tzinfo=tzutc()
                                ),
                                'DeleteOnTermination': True,
                                'Status': 'attached',
                                'VolumeId': 'vol-id',
                            },
                        }
                    ],
                    'ClientToken': 'token',
                    'EbsOptimized': False,
                    'Hypervisor': 'xen',
                    'NetworkInterfaces': [
                        {
                            'Association': {
                                'IpOwnerId': 'amazon',
                                'PublicDnsName': 'ec2-X.X.X.X.eu-west-1.compute.amazonaws.com',
                                'PublicIp': 'X.X.X.X',
                            },
                            'Attachment': {
                                'AttachTime': datetime.datetime(
                                    2016, 12, 6, 16, 9, 59, tzinfo=tzutc()
                                ),
                                'AttachmentId': 'eni-id',
                                'DeleteOnTermination': True,
                                'DeviceIndex': 0,
                                'Status': 'attached',
                            },
                            'Description': '',
                            'Groups': [{'GroupName': 'launch-wizard-11', 'GroupId': 'sg-id'}],
                            'Ipv6Addresses': [],
                            'MacAddress': 'x:x:x:x:x:x',
                            'NetworkInterfaceId': 'eni-id',
                            'OwnerId': 'XXXX',
                            'PrivateDnsName': 'ip-X.X.X.X.eu-west-1.compute.internal',
                            'PrivateIpAddress': 'X.X.X.X',
                            'PrivateIpAddresses': [
                                {
                                    'Association': {
                                        'IpOwnerId': 'amazon',
                                        'PublicDnsName': 'ec2-X.X.X.X.eu-west-1.compute.amazonaws.com',
                                        'PublicIp': 'X.X.X.X',
                                    },
                                    'Primary': True,
                                    'PrivateDnsName': 'ip-X.X.X.X.eu-west-1.compute.internal',
                                    'PrivateIpAddress': 'X.X.X.X',
                                }
                            ],
                            'SourceDestCheck': True,
                            'Status': 'in-use',
                            'SubnetId': 'subnet-id',
                            'VpcId': 'vpc-id',
                        }
                    ],
                    'RootDeviceName': '/dev/sda1',
                    'RootDeviceType': 'ebs',
                    'SecurityGroups': [{'GroupName': 'launch-wizard-11', 'GroupId': 'sg-1b0a9f7d'}],
                    'SourceDestCheck': True,
                    'Tags': [
                        {'Key': 'retention_daily', 'Value': '3'},
                        {'Key': 'hostgroup', 'Value': 'elk'},
                        {'Key': 'backup', 'Value': ''},
                        {'Key': 'Name', 'Value': 'elk'},
                        {'Key': 'retention_weekly', 'Value': '7'},
                    ],
                    'VirtualizationType': 'hvm',
                }
            ],
            'OwnerId': 'XXXX',
            'ReservationId': 'r-id',
        }
    ]
}

describe_snapshots = {
    'Snapshots': [
        {
            'Description': 'i-id',
            'Encrypted': False,
            'OwnerId': 'XXXX',
            'Progress': '100%',
            'SnapshotId': 'snap-id',
            'StartTime': datetime.datetime(2017, 9, 2, 22, 40, 45, tzinfo=tzutc()),
            'State': 'completed',
            'VolumeId': 'vol-id',
            'VolumeSize': 16,
            'Tags': [{'Key': 'Name', 'Value': 'elk'}, {'Key': 'DeleteOn', 'Value': '2017-09-03'}],
        }
    ],
    'ResponseMetadata': {
        'RequestId': 'id',
        'HTTPStatusCode': 200,
        'HTTPHeaders': {
            'content-type': 'text/xml;charset=UTF-8',
            'transfer-encoding': 'chunked',
            'vary': 'Accept-Encoding',
            'date': 'Sun, 03 Sep 2017 10:05:00 GMT',
            'server': 'AmazonEC2',
        },
        'RetryAttempts': 0,
    },
}
