def pytest_configure(config):
    config.addinivalue_line('markers', 'consistency: annotation consistency golden tests')
