import sys
import logging

from app import config

logger = logging.getLogger('API')
logger.setLevel(config.LOG_LEVEL)
logger.propagate = False

FORMAT = "%(asctime)s - %(levelname)s - %(name)s[%(threadName)s] - %(filename)s:%(lineno)d - %(message)s"

if config.APP_ENV == 'live':
    from logging.handlers import RotatingFileHandler
    file_handler = RotatingFileHandler('log/app.log', 'a', 1 * 1024 * 1024, 10)
    formatter = logging.Formatter(FORMAT)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

if config.APP_ENV == 'dev' or config.APP_ENV == 'local':
    stream_handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter(FORMAT)
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)


def get_logger():
    return logger
