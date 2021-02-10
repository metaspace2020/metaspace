import random
from functools import wraps
from time import sleep

from sm.engine.util import logger


def retry_on_exception(exception_type=Exception, num_retries=3, retry_wait_params=(2, 3, 5)):
    def decorator(func):
        func_name = getattr(func, '__name__', 'Function')

        @wraps(func)
        def wrapper(*args, **kwargs):
            for i in range(num_retries):
                try:
                    return func(*args, **kwargs)
                except exception_type as e:
                    wait_initial, wait_increase, jitter = retry_wait_params
                    min_wait = wait_initial + i * wait_increase
                    delay = random.uniform(min_wait, min_wait + jitter)
                    logger.warning(
                        f'{func_name} raised {type(e)} on attempt {i+1}. '
                        f'Retrying after {delay:.1f} seconds...'
                    )
                    sleep(delay)
            # Last attempt, don't catch the exception
            return func(*args, **kwargs)

        return wrapper

    return decorator
