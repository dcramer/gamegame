PG_CONTAINER=docker exec -t gamegame-postgres-1
PG_DATABASE=gamegame
PG_DATABASE_TEST=test_gamegame

install:
	pnpm run install

reset-db:
	$(MAKE) drop-db
	$(MAKE) create-db

reset-test-db:
	$(MAKE) drop-db-test
	$(MAKE) create-db-test

drop-db: drop-db-dev drop-db-test

drop-db-dev:
	$(PG_CONTAINER) dropdb --if-exists -h 127.0.0.1 -p 5432 -U postgres $(PG_DATABASE)

drop-db-test:
	$(PG_CONTAINER) dropdb --if-exists -h 127.0.0.1 -p 5432 -U postgres $(PG_DATABASE_TEST)

create-db: create-db-dev create-db-test

create-db-dev:
	$(PG_CONTAINER) createdb -E utf-8 -h 127.0.0.1 -p 5432 -U postgres $(PG_DATABASE) || exit 0

create-db-test:
	$(PG_CONTAINER) createdb -E utf-8 -h 127.0.0.1 -p 5432 -U postgres $(PG_DATABASE_TEST) || exit 0

wipe-node-modules:
	find . | grep node_modules$ | xargs rm -rf
