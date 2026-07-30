variable "vercel_api_token" {
  type        = string
  sensitive   = true
  description = "The Vercel API token to use for authentication."
}

variable "vercel_team" {
  type        = string
  description = "The Vercel team slug or ID, optional."
  default     = ""
}

variable "app_name" {
  type    = string
  default = "devcontainer-check"
}

variable "app_id" {
  type        = string
  description = "The ID of your GitHub App (`APP_ID`)."
}

variable "private_key" {
  type        = string
  sensitive   = true
  description = "The private key of your GitHub App (`PRIVATE_KEY`)."
}

variable "webhook_secret" {
  type        = string
  sensitive   = true
  description = "The webhook secret of your GitHub App (`WEBHOOK_SECRET`)."
}

variable "runner_repository" {
  type        = string
  description = "The repository (`owner/repo`) to use as the runner repository (`RUNNER_REPOSITORY`)."

  validation {
    condition     = length(split("/", var.runner_repository)) == 2
    error_message = "The `runner_repository` variable must be in the format `owner/repo`. Got: ${var.runner_repository}"
  }
}

variable "runner_repository_for_private" {
  type        = string
  description = "The repository (`owner/repo`) to use as the runner repository (`RUNNER_REPOSITORY_FOR_PRIVATE`) for private repositories."
  default     = ""

  validation {
    condition     = var.runner_repository_for_private == "" || length(split("/", var.runner_repository_for_private)) == 2
    error_message = "The `runner_repository_for_private` variable must be in the format `owner/repo`. Got: ${var.runner_repository_for_private}"
  }
}

variable "secret_variables" {
  type        = map(string)
  sensitive   = true
  description = "Additional secret variables to set in the Vercel environment."
  default     = {}
}

variable "variables" {
  type        = map(string)
  description = "Additional variables to set in the Vercel environment."
  default = {
    LOG_LEVEL = "info"
  }
}
