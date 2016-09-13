import psycopg2
import psycopg2.extras
import yaml
import numpy as np
import pandas as pd
from os.path import dirname, join

CONFIG_SEL = """
select config
from dataset
where name = %s
"""


config_fname = join(dirname(__file__), 'config.yml')
class ProcessingOptionsReader(object):
    def __init__(self, config_fname=config_fname):
        config = yaml.load(open(config_fname))
        conn = psycopg2.connect(host=config['postgres']['host'],
                                database=config['postgres']['database'],
                                user=config['postgres']['user'],
                                password=config['postgres']['password'])
        self.cur = conn.cursor(cursor_factory=psycopg2.extras.NamedTupleCursor)

    def fetch_processing_options(self, ds_name):
        self.cur.execute(CONFIG_SEL, [ds_name,])
        return self.cur.fetchall()

if __name__ == '__main__':
    pass
