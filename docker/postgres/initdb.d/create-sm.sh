psql sm "$POSTGRES_USER" -c "CREATE SCHEMA graphql;"
psql sm "$POSTGRES_USER" -c "ALTER SCHEMA graphql OWNER TO sm;"
psql sm "$POSTGRES_USER" -c 'CREATE EXTENSION "uuid-ossp";'