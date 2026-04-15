# devcontainer-check

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![codecov](https://codecov.io/gh/lasuillard-s/devcontainer-check/graph/badge.svg?token=7k6RoJEdWj)](https://codecov.io/gh/lasuillard-s/devcontainer-check)

A GitHub App to automate validating your repositories' dev container configuration.

![Demo](docs/demo.png)

## ❔ How it works

Below is sequence diagram describing how this app works:

```mermaid
sequenceDiagram
	participant target as Target Repository
	participant server as Webhook Handler
	participant runner as Runner Repository

  target ->> server: Push events
  server ->> server: Check if dev container configuration changed
  server ->> runner: Trigger workflow (workflow_dispatch)
  server ->> target: Update commit statuses (pending)
  runner ->> target: Checkout repository
  runner ->> runner: Check dev container configuration
  runner ->> server: workflow_run.completed event
  server ->> target: Update commit statuses (success or failure)
```

- **Why use GitHub Actions?**

  To validate, build and test containers. Most validations would be quick, but building and running containers takes some time and resource-heavy work. We reuse GitHub Actions for it.

- **Why must I self-host this app?**

  Because we have no infrastructure to run the tasks, we use the GitHub Actions infra. It will work on your GitHub Actions infra and consume the CI minutes of yours.

## ⚙️ Hosting the application

### 🤖 Create GitHub application

Here we describe creating GitHub App with [Probot GitHub App Manifest Flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest#using-probot-to-implement-the-github-app-manifest-flow). If you know what it is and prefer creating app manually, check the [app.yaml](app.yaml) file for required permissions and events to listen to.

> [!IMPORTANT]
> The app should have permission to access the runner repository as well to receive workflow run completion events.

> [!NOTE]
> Use [public/logo.png](public/logo.png) file to decorate your app if you want.

To get help of Probot, you should have Node.js and npm installed on your system. (or you can use Dev Container instead, which contains all the necessary dependencies by default.)

```
# Fork or clone this repository
git clone https://github.com/lasuillard-s/devcontainer-check.git

# Move to the project directory
cd devcontainer-check

# Install the dependencies
npm install

# Build the application
npm run build

# Run the development server
npm run dev
```

Then visit http://localhost:3000 to create a GitHub App with Probot's app registration helper.

![Probot Landing](docs/probot-landing.png)

Probot will create **.env** file in the repository with variables such as `APP_ID`, `PRIVATE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, etc. You will need it soon.

### 🖥️ Runner repository configuration

> [!WARNING]
> It is recommended to make the runner repository private. There's security risk of private repository content being exposed to the public (job logs) if runner repository is public.

The **Runner Repository** is a repository where check jobs run. You can reuse this repository as a runner repository as well (but recommended to make it private).

If you want to separate the runner repository, create a new repository and copy & paste [.github/workflows/devcontainer-check.yaml](.github/workflows/devcontainer-check.yaml) file in the created repository. Just don't forget to ensure the app is installed to the runner repository as well.

Once the runner repository is ready, go to **Settings** > **Security and Quality** > **Secrets and variables** > **Actions**

![Repository Secrets and Variables](docs/runner-variables.png)

Add below variables as **Repository secrets**:

- **APP_ID**: GitHub App ID
- **PRIVATE_KEY** GitHub App private key

This is required for runner repository to checkout the repository in the check workflow.

### 👂 Deploy Webhook Handler (app)

Here we describe deploying the webhook handler (app) to Vercel.

### 🏗️ Create Vercel project

Here, we will not describe how to create a Vercel project in detail.

1. Log in to Vercel
1. Create project then go to **Settings** > **Environment Variables**
1. Set following environment variables

   | Name                                                               | Value                |
   | ------------------------------------------------------------------ | -------------------- |
   | [NODEJS_HELPERS](https://probot.github.io/docs/deployment/#vercel) | 0                    |
   | APP_ID                                                             | From your GitHub App |
   | PRIVATE_KEY                                                        | 〃                   |
   | GITHUB_CLIENT_ID                                                   | 〃                   |
   | GITHUB_CLIENT_SECRET                                               | 〃                   |
   | WEBHOOK_SECRET                                                     | 〃                   |

   And app configuration variables (check [src/config.ts](src/config.ts) file for full reference):

   | Name                                | Description                                                                                                     |
   | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
   | RUNNER_REPOSITORY                   | **Required**. Full name (e.g. `"lasuillard-s/devcontainer-check"`) of the repository the check jobs should run. |
   | CHECK_WORKFLOW_NAME                 | Name of the workflow to be triggered. Defaults to `"devcontainer-check.yaml"`.                                  |
   | CHECK_WORKFLOW_REF                  | Git reference (tag or branch) which the workflow run on. Defaults to default branch (`""`).                     |
   | CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME | Name of the workflow artifact contain workflow inputs. Defaults to `"workflow-inputs"`.                         |
   | CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH | Path to the inputs file within the artifact zip archive. Defaults to `"inputs.json"`.                           |

1. Go to GitHub App settings page then update the webhook URL; e.g. `https://<project-name>.vercel.app/api/github/webhooks`

### 🚀 Set up automated deployment

> [!NOTE]
> You don't need this step unless you are making this repository private, because Vercel-managed deployment (via GitHub App) requires pro plan or above for private repositories in GitHub organization. If you are using managed deployment, just disable the deploy workflow in **Actions** tab.

Here we are going to set up automated deployment that runs on every code push to the main branch.

Go to **Settings** > **Environments**. then create new environment named **vercel**. This environment will be used by [deployment workflow](.github/workflows/deploy.yaml).

![GitHub Vercel Environment Variables](docs/deploy-vars.png)

Then add below as **Environment secrets**:

- **VERCEL_ORG_ID**: Find in Vercel **Team Settings** > **General** > **Team ID** or from `$.orgId` of **.vercel/project.json** file if using CLI
- **VERCEL_PROJECT_ID**: Find in Vercel **Project Settings** > **General** > **Project ID** or from `$.projectId` of **.vercel/project.json** file if using CLI
- **VERCEL_TOKEN**: Go to Vercel **Account Settings** > **Tokens** page and generate new one

Now the workflow should deploy app every time you push changes to the main branch.
