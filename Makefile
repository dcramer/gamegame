PG_CONTAINER=docker exec -t gamegame-postgres-1
PG_DATABASE=gamegame
PG_DATABASE_TEST=test_gamegame

setup: install create-db migrate

install:
	pnpm install

reset-db:
	$(MAKE) drop-db
	$(MAKE) create-db
	$(MAKE) migrate

reset-test-db:
	$(MAKE) drop-db-test
	$(MAKE) create-db-test
	$(MAKE) migrate-test

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

migrate:
	DATABASE_URL=postgresql://postgres:postgres@localhost:5433/$(PG_DATABASE) pnpm db:migrate

migrate-test:
	DATABASE_URL=postgresql://postgres:postgres@localhost:5433/$(PG_DATABASE_TEST) pnpm db:migrate

wipe-node-modules:
	find . | grep node_modules$ | xargs rm -rf

grant-admin:
	@read -p "Enter email address: " email; \
	$(PG_CONTAINER) psql -h 127.0.0.1 -p 5432 -U postgres $(PG_DATABASE) -c "UPDATE users SET admin = TRUE WHERE email = '$$email';"
