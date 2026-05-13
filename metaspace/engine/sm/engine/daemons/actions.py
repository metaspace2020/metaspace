class DaemonAction:
    ANNOTATE = 'annotate'
    UPDATE = 'update'
    INDEX = 'index'
    DELETE = 'delete'
    CLASSIFY_OFF_SAMPLE = 'classify_off_sample'
    SEGMENTATION = 'segmentation'
    EXPERIMENT_STATS = 'experiment_stats'
    EXPERIMENT_STATS_ONLY = 'experiment_stats_only'


class DaemonActionStage:
    QUEUED = 'QUEUED'
    STARTED = 'STARTED'
    FINISHED = 'FINISHED'
    FAILED = 'FAILED'
