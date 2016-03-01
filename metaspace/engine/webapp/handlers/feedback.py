"""
User authentication module
"""
import tornado.web
from tornado import gen
import json
import requests


FEEDBACK_INS = ("INSERT INTO feedback (client_id, job_id, db_id, sf_id, adduct, rating, comment) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)")
RATING_UPD = ("UPDATE feedback SET rating = %s "
              "WHERE job_id=%s AND db_id=%s AND sf_id=%s AND adduct=%s AND client_id=%s")
COMMENT_UPD = ("UPDATE feedback SET comment = %s "
               "WHERE job_id=%s AND db_id=%s AND sf_id=%s AND adduct=%s AND client_id=%s")
FEEDBACK_SEL = ("SELECT rating, comment FROM feedback WHERE job_id=%s AND db_id=%s AND sf_id=%s AND adduct=%s "
                "AND client_id=%s")


def arg_dict(args):
    return {k: v[0] for k, v in args.items()}


def upsert_feedback(db, client_id, args):
    assert ('rating' in args or 'comment' in args)

    if db.query(FEEDBACK_SEL, args['job_id'], args['db_id'], args['sf_id'], args['adduct'], client_id):
        if 'rating' in args:
            db.query(RATING_UPD,
                     args['rating'], args['job_id'], args['db_id'], args['sf_id'], args['adduct'], client_id)
        elif 'comment' in args:
            db.query(COMMENT_UPD,
                     args['comment'], args['job_id'], args['db_id'], args['sf_id'], args['adduct'], client_id)
    else:
        if 'rating' in args:
            db.query(FEEDBACK_INS,
                     client_id, args['job_id'], args['db_id'], args['sf_id'], args['adduct'], args['rating'], None)
        elif 'comment' in args:
            db.query(FEEDBACK_INS,
                     client_id, args['job_id'], args['db_id'], args['sf_id'], args['adduct'], 0, args['comment'])


class FeedbackRating(tornado.web.RequestHandler):

    @gen.coroutine
    def post(self):
        args = arg_dict(self.request.body_arguments)
        client_id = self.get_secure_cookie('client_id')
        if client_id:
            upsert_feedback(self.application.db, client_id, args)
            print 'Saved {} rating from {} client'.format(args['rating'], client_id)
        else:
            print 'Not authenticated user sent a rating'

    @gen.coroutine
    def get(self):
        client_id = self.get_secure_cookie('client_id')
        if not client_id:
            self.write({})
            print 'Sent empty feedback'.format()
            return

        args = arg_dict(self.request.arguments)
        feed_rs = self.application.db.query(FEEDBACK_SEL, args['job_id'], args['db_id'],
                                            args['sf_id'], args['adduct'], client_id)
        if not feed_rs:
            self.write({})
            print 'Sent empty feedback'.format()
            return

        self.write(dict(rating=feed_rs[0]['rating']))
        print 'Sent saved rating from {} user'.format(client_id)


class FeedbackComment(tornado.web.RequestHandler):

    @gen.coroutine
    def post(self):
        args = arg_dict(self.request.body_arguments)
        client_id = self.get_secure_cookie('client_id')
        if client_id:
            upsert_feedback(self.application.db, client_id, args)
            print 'Saved "{}" comment from {} client'.format(args['comment'], client_id)
        else:
            print 'Not authenticated user sent a comment'

    @gen.coroutine
    def get(self):
        client_id = self.get_secure_cookie('client_id')
        if not client_id:
            self.write({})
            print 'Sent empty feedback'.format()
            return

        args = arg_dict(self.request.arguments)
        feed_rs = self.application.db.query(FEEDBACK_SEL, args['job_id'], args['db_id'],
                                            args['sf_id'], args['adduct'], client_id)
        if not feed_rs:
            self.write({})
            print 'Sent empty feedback'.format()
            return

        self.write(dict(comment=feed_rs[0]['comment']))
        print 'Sent saved comment from {} user'.format(client_id)
