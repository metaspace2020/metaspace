from sm.engine.db import DB


class LocalAnnotationJob:
    def __init__(self):
        pass


class ServerAnnotationJob:
    def __init__(self):
        self._db = DB()
        pass
