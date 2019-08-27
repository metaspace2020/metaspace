from pathlib import Path

schema_path = Path(__file__).parent / 'graphql_schema.sql'

PATCH = """
ALTER TABLE "graphql"."user" ALTER COLUMN credentials_id DROP NOT NULL;
"""

try:
    with schema_path.open('r') as f:
        GRAPHQL_SQL_SCHEMA = f.read() + PATCH
except IOError:
    raise AssertionError('graphql_schema.sql is missing. Run `yarn run gen-sql-schema` in the graphql project.')
