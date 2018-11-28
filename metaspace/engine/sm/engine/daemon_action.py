class DaemonAction(object):
    ANNOTATE = 'annotate'
    UPDATE = 'update'
    INDEX = 'index'
    DELETE = 'delete'


class DaemonActionStage(object):
    QUEUED = 'QUEUED'
    STARTED = 'STARTED'
    FINISHED = 'FINISHED'
    FAILED = 'FAILED'