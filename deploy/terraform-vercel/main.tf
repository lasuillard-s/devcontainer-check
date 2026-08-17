locals {
  project_root_relative = "../../"
  project_root          = abspath("${path.module}/${local.project_root_relative}")
}

resource "vercel_project" "app" {
  name = var.app_name
}

resource "vercel_project_environment_variables" "sensitive_config" {
  project_id = vercel_project.app.id
  variables = concat(
    [
      {
        key       = "PRIVATE_KEY"
        value     = var.private_key
        target    = ["production"]
        sensitive = true
      },
      {
        key       = "WEBHOOK_SECRET"
        value     = var.webhook_secret
        target    = ["production"]
        sensitive = true
      },
    ],
    [
      for key, value in var.secret_variables :
      {
        key       = key
        value     = value
        target    = ["production"]
        sensitive = true
      }
    ]
  )
}

resource "vercel_project_environment_variables" "config" {
  project_id = vercel_project.app.id
  variables = concat(
    [
      {
        # https://probot.github.io/docs/deployment/#vercel
        key       = "NODEJS_HELPERS"
        value     = "0"
        target    = ["production"]
        sensitive = false
      },
      {
        key       = "APP_ID"
        value     = var.app_id
        target    = ["production"]
        sensitive = false
      },
      {
        key       = "RUNNER_REPOSITORY"
        value     = var.runner_repository
        target    = ["production"]
        sensitive = false
      },
    ],
    var.runner_repository_for_private == "" ? [] : [
      {
        key       = "RUNNER_REPOSITORY_FOR_PRIVATE"
        value     = var.runner_repository_for_private
        target    = ["production"]
        sensitive = false
      },
    ],
    [
      for key, value in var.variables :
      {
        key       = key
        value     = value
        target    = ["production"]
        sensitive = false
      }
    ]
  )
}

data "vercel_project_directory" "app" {
  path = local.project_root_relative
}

resource "vercel_deployment" "app" {
  project_id = vercel_project.app.id

  files       = data.vercel_project_directory.app.files
  path_prefix = data.vercel_project_directory.app.path
  production  = true
}
