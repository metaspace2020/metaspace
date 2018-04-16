
class SMError(Exception):
    def __init__(self, msg=None):
        self.message = msg


class JobFailedError(SMError):
    def __init__(self, msg):
        super().__init__(msg)


class ESExportFailedError(SMError):
    def __init__(self, msg):
        super().__init__(msg)


class UnknownDSID(SMError):
    def __init__(self, msg):
        super().__init__(msg)


class DSIDExists(SMError):

    def __init__(self, ds_id):
        super().__init__('Dataset already exists: {}'.format(ds_id))

