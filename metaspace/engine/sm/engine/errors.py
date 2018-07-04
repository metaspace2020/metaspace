
class SMError(Exception):
    def __init__(self, msg=None):
        self.message = msg


class JobFailedError(SMError):
    def __init__(self, msg):
        super().__init__(msg)


class ESExportFailedError(SMError):
    def __init__(self, msg):
        super().__init__(msg)


class DSError(SMError):
    def __init__(self, ds_id, msg):
        super().__init__(msg)
        self.ds_id = ds_id


class UnknownDSID(DSError):
    def __init__(self, ds_id):
        super().__init__(ds_id, f'DS {ds_id} does not exist')


class DSIDExists(DSError):

    def __init__(self, ds_id):
        super().__init__(ds_id, f'Dataset {ds_id} already exists')


class DSIsBusy(DSError):

    def __init__(self, ds_id):
        super().__init__(ds_id, f'Dataset {ds_id} is busy')
