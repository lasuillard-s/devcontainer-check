terraform {
  required_version = "~> 1.0"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = ">= 5.9.1"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}
