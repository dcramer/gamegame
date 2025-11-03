.PHONY: help setup reset clean install migrate dev test db-reset db-reset-test games users

# Colors for output
GREEN  := $(shell tput -Txterm setaf 2)
YELLOW := $(shell tput -Txterm setaf 3)
BLUE   := $(shell tput -Txterm setaf 4)
RESET  := $(shell tput -Txterm sgr0)

help: ## Show this help message
	@echo ''
	@echo '$(BLUE)GameGame Workers - Development Commands$(RESET)'
	@echo ''
	@echo '$(YELLOW)Setup & Reset:$(RESET)'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '(setup|reset|clean|install)' | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ''
	@echo '$(YELLOW)Development:$(RESET)'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '(dev|migrate|test)' | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ''
	@echo '$(YELLOW)Database:$(RESET)'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '(db-)' | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ''
	@echo '$(YELLOW)CLI Shortcuts:$(RESET)'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '(games|users)' | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ''
	@echo '$(YELLOW)Examples:$(RESET)'
	@echo '  make setup              # First-time setup'
	@echo '  make reset              # Clean reset of local env'
	@echo '  make db-reset           # Reset just the database'
	@echo '  make games              # List all games'
	@echo '  make dev                # Start dev server'
	@echo ''

# Setup & Installation
install: ## Install dependencies
	@echo "$(BLUE)Installing dependencies...$(RESET)"
	@pnpm install

setup: install ## Complete first-time setup (install + migrate + env check)
	@echo "$(BLUE)Setting up local environment...$(RESET)"
	@if [ ! -f ".dev.vars" ]; then \
		echo "$(YELLOW)Creating .dev.vars template...$(RESET)"; \
		echo "OPENAI_API_KEY=your-openai-key-here" > .dev.vars; \
		echo "MISTRAL_API_KEY=your-mistral-key-here" >> .dev.vars; \
		echo "JWT_SECRET=$$(openssl rand -base64 32)" >> .dev.vars; \
		echo "$(YELLOW)⚠ Add your API keys to .dev.vars$(RESET)"; \
	fi
	@$(MAKE) migrate
	@echo "$(GREEN)✓ Setup complete!$(RESET)"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Edit .dev.vars with your API keys"
	@echo "  2. Run: make dev"
	@echo ""

setup-test: ## Setup test environment (runs setup-test-env.sh)
	@./setup-test-env.sh

# Reset commands
clean: ## Remove node_modules and .wrangler
	@echo "$(YELLOW)Cleaning node_modules and .wrangler...$(RESET)"
	@rm -rf node_modules .wrangler
	@echo "$(GREEN)✓ Clean complete$(RESET)"

db-reset: ## Reset local database (deletes and recreates)
	@echo "$(YELLOW)Resetting local database...$(RESET)"
	@rm -rf .wrangler/state/v3/d1/miniflare-D1DatabaseObject
	@$(MAKE) migrate
	@echo "$(GREEN)✓ Database reset complete$(RESET)"

db-reset-test: ## Reset test database
	@echo "$(YELLOW)Resetting test database...$(RESET)"
	@rm -rf .wrangler/state/v3/d1/miniflare-D1DatabaseObject-test
	@pnpm db:migrate:local
	@echo "$(GREEN)✓ Test database reset complete$(RESET)"

reset: clean install db-reset ## Complete reset (clean + install + db-reset)
	@echo "$(GREEN)✓ Full reset complete!$(RESET)"
	@echo ""
	@echo "Run: make dev"
	@echo ""

# Database operations
migrate: ## Run database migrations (local)
	@echo "$(BLUE)Running migrations...$(RESET)"
	@pnpm db:migrate:local

migrate-remote: ## Run database migrations (production)
	@echo "$(YELLOW)⚠ Running migrations on PRODUCTION$(RESET)"
	@read -p "Are you sure? (y/N): " confirm && [ "$$confirm" = "y" ] || exit 1
	@pnpm db:migrate:remote

db-studio: ## Open Drizzle Studio
	@pnpm db:studio

# Development
dev: ## Start development server
	@pnpm dev

test: ## Run test suite
	@pnpm test

test-watch: ## Run tests in watch mode
	@pnpm test:watch

type-check: ## Run TypeScript type checking
	@pnpm type-check

# CLI Shortcuts
games: ## List all games (local)
	@pnpm cli games list

games-remote: ## List all games (production)
	@pnpm cli games list --remote

users: ## Show users command help
	@pnpm cli users

# Utility commands
.DEFAULT_GOAL := help
