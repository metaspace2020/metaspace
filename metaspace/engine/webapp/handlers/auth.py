"""
User authentication module
"""
import tornado.web
from tornado import gen
import json
import requests


CLIENT_SEL = 'SELECT id FROM client WHERE id = %s'
CLIENT_INS = 'INSERT INTO client VALUES (%s, %s, %s)'


class AuthenticateClient(tornado.web.RequestHandler):

    @staticmethod
    def validate_id_token(id_token):
        return requests.post('https://www.googleapis.com/oauth2/v3/tokeninfo',
                             data={'id_token': id_token},
                             headers={'contentType': 'application/x-www-form-urlencoded'})

    def sign_in(self, id_token):
        val_resp = self.validate_id_token(id_token).json()
        client_id = val_resp['sub']
        client_name = val_resp['name']
        client_email = val_resp['email']
        self.set_secure_cookie('client_id', client_id)

        if not self.application.db.query(CLIENT_SEL, client_id):
            self.application.db.query(CLIENT_INS, client_id, client_name, client_email)

        print 'Signed in as {}'.format(client_name)

    def sign_out(self):
        client_id = self.get_secure_cookie('client_id')
        self.clear_cookie('client_id')

        print 'User id {} signed out'.format(client_id)

    @gen.coroutine
    def post(self):
        resp_args = self.request.body_arguments
        if resp_args['action'][0] == 'sign_in':
            self.sign_in(resp_args['id_token'])
        elif resp_args['action'][0] == 'sign_out':
            self.sign_out()
