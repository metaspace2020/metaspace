import os

schema_path = os.path.join(os.path.dirname(__file__), 'graphql_schema.sql')

PATCH = """
ALTER TABLE "graphql"."user" ALTER COLUMN credentials_id DROP NOT NULL;
"""

try:
    with open(schema_path) as f:
        GRAPHQL_SQL_SCHEMA = f.read() + PATCH
except IOError:
    raise AssertionError('graphql_schema.sql is missing. Run `yarn run gen-sql-schema` in the graphql project.')