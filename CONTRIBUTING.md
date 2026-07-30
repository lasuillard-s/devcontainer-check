# ❤️‍🔥 Contributing to this project

Thank you for your interest in contributing to **devcontainer-check**.

## 🐛 Reporting issues

Please report issues in our [GitHub repository](https://github.com/lasuillard-s/devcontainer-check/issues). Before submitting an issue, search for existing issues to avoid duplicates.

## 🏗️ Project overview

This project is a GitHub App built with [Probot](https://probot.github.io/) and TypeScript. It watches for pushes to target repositories, dispatches a validation workflow in a runner repository when dev container files change, and updates commit statuses when the runner workflow finishes.

### 🛠️ Tech stack

This project uses the following tech stack:

- [TypeScript](https://www.typescriptlang.org/) on [Node.js](https://nodejs.org/) 24+
- [Probot](https://probot.github.io/) for the GitHub App runtime
- [Vitest](https://vitest.dev/), [ESLint](https://eslint.org/), and [Prettier](https://prettier.io/) for testing and code quality

### 📂 Key directory structure

- `src/`: Application source code
- `src/handlers/`: Event handlers for push and workflow completion events
- `test/`: Unit tests and fixtures
- `app.yaml`: GitHub App manifest
- `flake.nix`: Nix Flake configuration for the development environment
- `Justfile`: Development and maintenance commands
- `vercel.json`: Vercel build configuration

## 🔧 Set up the development environment

This repository uses `nix` to manage dependencies and development tools. Run `nix develop` to set up a local development environment, then run `just install` to install dependencies.

Development environment comes with following tools installed:

- `pre-commit`
- `just` for command runner
- Node.js 24.x
- `ngrok` for webhook testing
- `devcontainer` CLI for dev container testing
- `opentofu` for deployment

If you prefer a Dev Container, an example configuration is available in [.devcontainer.example/devcontainer.json](.devcontainer.example/devcontainer.json). Copy it to `.devcontainer/devcontainer.json` to use it locally.

## ✅ Verifying changes

Before pushing your code, run `just ci` to verify formatting, linting, type checking, and tests.

## ✨ Submitting changes

Please submit pull requests on GitHub. Before opening a PR, make sure your changes pass the relevant checks locally.

## 🚀 Release process

This project is provided as-is. Available deployment options are included in the [deploy](./deploy) directory. Please refer to the directory for detailed instructions on how to deploy the app to your preferred platform.
