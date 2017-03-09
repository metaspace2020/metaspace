
class SMError(Exception):
    def __init__(self, msg=None):
        self.msg = msg


class UnknownDSID(SMError):
    def __init__(self, msg):
        super(UnknownDSID, self).__init__(msg)
