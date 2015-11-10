"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import psycopg2
import psycopg2.extras


class DB(object):

    def __init__(self, config):
        self.conn = psycopg2.connect(**config)

    def select(self, sql, params):
        curs = self.conn.cursor()
        curs.execute(sql, params)
        return curs.fetchall()
