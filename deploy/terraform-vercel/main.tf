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
  path = "../../"
}

resource "vercel_deployment" "app" {
  project_id = vercel_project.app.id

  # Because Terraform have trouble .vercelignore file with allowlist patterns,
  # we filter unwanted files as we need
  files = {
    # e.g. "../../src/handlers/push.ts" = "5318~3e45ec05f69b18092d79dd6874c98cf5da16406a"
    for key, value in data.vercel_project_directory.app.files :
    key => value
    if(
      # Allowlist
      startswith(key, "../../api/")
      || startswith(key, "../../src/")
      || startswith(key, "../../public/")
      || contains([
        "../../app.yaml",
        "../../LICENSE",
        "../../package-lock.json",
        "../../package.json",
        "../../README.md",
        "../../tsconfig.json",
        "../../vercel.json",
      ], key)
    ) &&
    # Denylist over allowlist
    !can(regex(".*~$|\\.log$", key))
  }

  path_prefix = data.vercel_project_directory.app.path
  production  = true
}
