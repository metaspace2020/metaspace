class DaemonAction(object):
    ANNOTATE = 'annotate'
    UPDATE = 'update'
    INDEX = 'index'
    DELETE = 'delete'
    ANALYZE_OFF_SAMPLE = 'analyze_off_sample'


class DaemonActionStage(object):
    QUEUED = 'QUEUED'
    STARTED = 'STARTED'
    FINISHED = 'FINISHED'
    FAILED = 'FAILED'