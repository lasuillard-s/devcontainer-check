# Deploy to Vercel with Terraform

This guide explains how to deploy the app to Vercel using Terraform Cloud as the state backend (which offers 500 managed resources for free) with a Version Control Workflow.

> [!NOTE]
> You can also use the Terraform CLI to deploy to Vercel, but you will need to manage the state file yourself.

## Create a workspace in Terraform Cloud

First, create a new workspace in Terraform Cloud with **Version Control Workflow**.

![Create a new workspace in Terraform Cloud](docs/create-new-workspace.png)

![Choose workflow type](docs/choose-workflow-type.png)

## Connect your repository

If you have not connected your repository, install the Terraform GitHub App on your account or organization first:

![Connect to a version control provider](docs/connect-vcs.png)

Then choose your repository (fork or clone).

![Choose a repository](docs/choose-repo.png)

## Configure your workspace

Click **Advanced options** below and set the **Terraform working directory** to `deploy/terraform-vercel`.

![Update advanced options](docs/update-advanced-options.png)

You will be prompted to add variables to your workspace, as follows:

![Add recommended workspace variables](docs/add-recommended-workspace-variables.png)

For variables Terraform Cloud does not catch, you can add them manually on the **Variables** page later.

![Add workspace variables](docs/add-workspace-variables.png)

## Deploy the app

Click **New run** and start a plan to deploy the app to Vercel.

![Start new speculative plan](docs/start-new-run.png)

Review the plan and click **Confirm & apply** to deploy the app to Vercel.

![Review the plan](docs/review-plan.png)

## Update your GitHub App configuration

Check the outputs for the following steps to complete the setup of your GitHub App.

![Check the outputs](docs/check-outputs.png)

Finish your GitHub App configuration using the outputs. For example, you need to update the webhook URL to receive events from GitHub.

![Update GitHub App webhook URL](docs/update-webhook-url.png)
