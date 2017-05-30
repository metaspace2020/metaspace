
class SMError(Exception):
    def __init__(self, msg=None):
        self.message = msg


class JobFailedError(SMError):
    def __init__(self, msg):
        super(JobFailedError, self).__init__(msg)


class UnknownDSID(SMError):
    def __init__(self, msg):
        super(UnknownDSID, self).__init__(msg)
