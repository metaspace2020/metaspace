import json

import bottle

OK = {'status_code': 200, 'status': 'success'}
NOT_EXIST = {'status_code': 404, 'status': 'not_exist'}
ALREADY_EXISTS = {'status_code': 400, 'status': 'already_exists'}
WRONG_PARAMETERS = {'status_code': 400, 'status': 'wrong_parameters'}
INTERNAL_ERROR = {'status_code': 500, 'status': 'server_error'}


def body_to_json(request):
    # Handle different Bottle versions - some have getvalue(), others need read()
    if hasattr(request.body, 'getvalue'):
        body = request.body.getvalue()
    else:
        body = request.body.read()

    if isinstance(body, bytes):
        body = body.decode('utf-8')

    return json.loads(body)


def make_response(status_doc, **kwargs):
    bottle.response.status = status_doc['status_code']
    return {'status': status_doc['status'], **kwargs}
