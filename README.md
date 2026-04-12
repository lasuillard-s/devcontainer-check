# devcontainer-check

[![codecov](https://codecov.io/gh/lasuillard-s/devcontainer-check/graph/badge.svg?token=7k6RoJEdWj)](https://codecov.io/gh/lasuillard-s/devcontainer-check)

A GitHub App to automate validating your repositories' dev container configuration.

## Getting Started

This app is made for internal use only. You must self-host this application.

You should have Node.js, npm installed on your system. Otherwise, you can use Dev Container instead.

```
# Fork or clone this repository
git clone https://github.com/lasuillard-s/devcontainer-check.git

# Move to the project directory
cd devcontainer-check

# Install the dependencies (`npm install`)
npm install

# Run the development server
npm run dev
```

Then visit to the http://localhost:3000 to creates GitHub App with Probot's app registration helper.

![Probot Landing](docs/probot-landing.png)
