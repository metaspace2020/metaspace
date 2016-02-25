"""
User authentication module
"""
import tornado.web
from tornado import gen
import json
import requests


FEEDBACK_DEL = "DELETE FROM feedback WHERE client_id=%s AND job_id=%s AND db_id=%s AND sf_id=%s AND adduct=%s"
FEEDBACK_INS = ("INSERT INTO feedback (client_id, job_id, db_id, sf_id, adduct, rating, comment) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)")
FEEDBACK_SEL = ("SELECT rating, comment FROM feedback WHERE job_id=%s AND db_id=%s AND sf_id=%s AND adduct=%s "
                "AND client_id=%s")


class Feedback(tornado.web.RequestHandler):

    @gen.coroutine
    def post(self):
        resp_args = {k: v[0] for k, v in self.request.body_arguments.items()}
        client_id = self.get_secure_cookie('client_id')
        if client_id:
            ids = [client_id, resp_args['job_id'], resp_args['db_id'], resp_args['sf_id'], resp_args['adduct']]
            feedback = [resp_args['rating'], resp_args['comment']]
            self.application.db.query(FEEDBACK_DEL, *ids)
            self.application.db.query(FEEDBACK_INS, *(ids + feedback))

            print 'Saved rating from {} client'.format(client_id)
        else:
            print 'Not authenticated user sent feedback'

    @gen.coroutine
    def get(self):
        client_id = self.get_secure_cookie('client_id')
        if not client_id:
            self.write({})
            print 'Sent empty feedback'.format()
            return

        feed_rs = self.application.db.query(FEEDBACK_SEL, self.get_argument('job_id'), self.get_argument('db_id'),
                                            self.get_argument('sf_id'), self.get_argument('adduct'), client_id)
        if not feed_rs:
            self.write({})
            print 'Sent empty feedback'.format()
            return

        self.write(dict(feed_rs[0]))
        print 'Sent saved feedback from {} user'.format(client_id)


