import logging

import psycopg2.errors
import bottle

from sm.engine import molecular_db
from sm.rest.utils import (
    body_to_json,
    make_response,
    WRONG_PARAMETERS,
    OK,
    ALREADY_EXISTS,
    INTERNAL_ERROR,
)

MALFORMED_CSV = {'status_code': 400, 'status': 'malformed_csv'}
BAD_DATA = {'status_code': 400, 'status': 'bad_data'}

logger = logging.getLogger('api')
app = bottle.Bottle()


@app.post('/create')
def create():
    """Create a molecular database and import molecules.

    Request: {
        name - short database name
        version - database version, any string
        group_id - UUID of group database belongs to
        user_id - UUID of user database create to
        is_public - database search results visible to everybody
        file_path - S3 path to database import file (s3://bucket/path)
        description - database description
        full_name - full database name
        link - public database URL
        citation - database citation string
    }

    Response: {
        status - success or error type
        data?: {
            id - unique int id
            name
            version
        }
        errors? - list of database import errors
    }
    """
    params = None
    try:
        params = body_to_json(bottle.request)
        logger.info(f'Creating molecular database. Params: {params}')

        required_fields = ['name', 'version', 'group_id', 'user_id', 'file_path']
        if not all(field in params for field in required_fields):
            return make_response(WRONG_PARAMETERS, errors=[f'Required fields: {required_fields}'])

        moldb = molecular_db.create(**params)

        return make_response(OK, data=moldb.to_dict())
    except psycopg2.errors.UniqueViolation:  # pylint: disable=no-member
        logger.exception(f'Database already exists. Params: {params}')
        return make_response(ALREADY_EXISTS)
    except molecular_db.MalformedCSV as e:
        logger.exception(f'Malformed CSV file. Params: {params}')
        return make_response(MALFORMED_CSV, error=e.message)
    except molecular_db.BadData as e:
        logger.exception(f'Bad data in CSV file: {e.message}, {e.errors} Params: {params}')
        return make_response(BAD_DATA, error='Bad data in CSV file', details=e.errors)
    except Exception:
        logger.exception(f'Server error. Params: {params}')
        return make_response(INTERNAL_ERROR)


@app.post('/<moldb_id>/delete')
def delete(moldb_id):
    """Delete the molecular database and all associated jobs."""
    try:
        logger.info(f'Deleting molecular database. ID: {moldb_id}')
        molecular_db.delete(moldb_id)
        return make_response(OK)
    except Exception:
        logger.exception(f'Server error. ID: {moldb_id}')
        return make_response(INTERNAL_ERROR)


@app.post('/<moldb_id>/update')
def update(moldb_id):
    """Update a molecular database.

    Request: {
        archived: {true/false}
        description - database description
        full_name - full database name
        link - public database URL
        citation - database citation string
    }

    Response: {
        status - success or error type
        data?: {
            id - unique int id
            name
            version
        }
        errors? - list of database import errors
    }
    """
    params = None
    try:
        params = body_to_json(bottle.request)
        logger.info(f'Updating molecular database. ID: {moldb_id}. Params: {params}')
        moldb = molecular_db.update(moldb_id, **params)
        return make_response(OK, data=moldb.to_dict())
    except Exception:
        logger.exception(f'Server error. ID: {moldb_id}. Params: {params}')
        return make_response(INTERNAL_ERROR)
