MOCK_GRAPHQL_SCHEMA = '''
    CREATE SCHEMA IF NOT EXISTS graphql;
    CREATE TABLE IF NOT EXISTS graphql.dataset (
        id              text,
        user_id         uuid,
        group_id        uuid,
        group_approved  boolean
    );
    CREATE TABLE IF NOT EXISTS graphql.user (
        id                  uuid,
        name                text,
        email               text,
        not_verified_email  text
    );
    CREATE TABLE IF NOT EXISTS graphql.group (
        id          uuid,
        name        text,
        short_name  text
    );
    CREATE TABLE IF NOT EXISTS graphql.dataset_project (
        dataset_id  text,
        project_id  uuid,
        approved    boolean
    );
    CREATE TABLE IF NOT EXISTS graphql.project (
        id          uuid,
        name        text
    );'''