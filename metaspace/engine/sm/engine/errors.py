class SMError(Exception):
    pass


class AnnotationError(SMError):
    def __init__(self, ds_id, traceback):
        self.ds_id = ds_id
        self.traceback = traceback
        super().__init__(f"Annotation failed (ds_id={ds_id})")


class IndexUpdateError(SMError):
    def __init__(self, ds_id, traceback):
        self.ds_id = ds_id
        self.traceback = traceback
        super().__init__(f"Index update failed (ds_id={ds_id})")


class ImzMLError(SMError):
    def __init__(self, traceback):
        super().__init__('Error parsing imzML file')
        self.traceback = traceback


class IbdError(SMError):
    def __init__(self, traceback):
        super().__init__('Incomplete ibd file')
        self.traceback = traceback


class LimitError(SMError):
    def __init__(self, message_or_traceback=None):
        if isinstance(message_or_traceback, str) and not message_or_traceback.startswith(
            'Traceback'
        ):
            super().__init__(message_or_traceback)
            self.traceback = None
        else:
            super().__init__('Limit exceeded')
            self.traceback = message_or_traceback


class DSError(SMError):
    def __init__(self, ds_id, message):
        super().__init__(message)
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
