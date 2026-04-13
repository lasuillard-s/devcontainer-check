#!/usr/bin/env --split-string make --makefile

MAKEFLAGS += --warn-undefined-variable --no-builtin-rules --silent
.DEFAULT_GOAL := help
.DELETE_ON_ERROR:
.SUFFIXES:

SHELL := bash
.ONESHELL:
.SHELLFLAGS := -o errexit -o nounset -o pipefail -c


help: Makefile  ## Show this help message
	@grep -E '(^[a-zA-Z_-]+:.*?##.*$$)|(^##)' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[32m%-30s\033[0m %s\n", $$1, $$2}' | sed -e 's/\[32m##/[33m/'


# =============================================================================
# Common
# =============================================================================
install:  ## Install deps and tools
	npm install
.PHONY: install

init:  ## Initialize the project workspace
	pre-commit install --install-hooks
.PHONY: init

update:  ## Update deps and tools
	npm update
	pre-commit autoupdate
.PHONY: update

run:  ## Run the app
	npm run dev:watch
.PHONY: run


# =============================================================================
# CI
# =============================================================================
ci: lint test  ## Run CI tasks
.PHONY: ci

fmt:  ## Run autoformatters
	npm run fmt
.PHONY: fmt

fix:  ## Autofix issues
	npm run lint:fix
.PHONY: fix

lint:  ## Run all linters
	npm run fmt:check
	npm run lint
	npm run typecheck
.PHONY: lint

test:  ## Run tests
	npm run test
.PHONY: test


# =============================================================================
# Handy Scripts
# =============================================================================
clean:  ## Remove temporary files
	rm --recursive --force coverage/ junit.xml .svelte-kit/ dist/ .tmp/ playwright-report/ dummy-non-existing-folder/
	find . -path '*/__snapshots__*' -delete
	find . -path "*.log*" -delete
.PHONY: clean
