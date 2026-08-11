provider "vercel" {
  api_token = var.vercel_api_token
  team      = var.vercel_team
}

# NOTE: GitHub provider configuration is not mandatory because we are using it
#       to get a GitHub App token for validation purposes.
