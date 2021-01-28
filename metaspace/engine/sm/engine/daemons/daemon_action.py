class DaemonAction:
    ANNOTATE = 'annotate'
    UPDATE = 'update'
    INDEX = 'index'
    DELETE = 'delete'
    CLASSIFY_OFF_SAMPLE = 'classify_off_sample'


class DaemonActionStage:
    QUEUED = 'QUEUED'
    STARTED = 'STARTED'
    FINISHED = 'FINISHED'
    FAILED = 'FAILED'
