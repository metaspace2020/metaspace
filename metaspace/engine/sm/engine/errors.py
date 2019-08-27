class SMError(Exception):
    def __init__(self, msg=None):
        self.message = msg


class AnnotationError(SMError):
    def __init__(self, ds_id, traceback):
        super().__init__()
        self.ds_id = ds_id
        self.traceback = traceback
        self.message = f"Annotation failed (ds_id={self.ds_id})"


class IndexUpdateError(SMError):
    def __init__(self, msg):
        super().__init__(msg)


class ImzMLError(SMError):
    def __init__(self, traceback):
        super().__init__()
        self.traceback = traceback


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
