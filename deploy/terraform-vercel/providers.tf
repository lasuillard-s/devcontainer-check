provider "vercel" {
  api_token = var.vercel_api_token

  # Optional default team for all resources
  team = var.vercel_team
}
