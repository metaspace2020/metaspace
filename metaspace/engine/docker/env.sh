echo 'localhost:5432:sm:password\n' > ~/.pgpass
chmod 0600 ~/.pgpass

mkdir -p logs
cp docker/sci_test_config.json conf/config.json
