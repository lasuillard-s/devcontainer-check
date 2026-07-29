output "webhook_urls" {
  description = "Webhook URLs you can use for your GitHub App."
  value = [
    for domain in resource.vercel_deployment.app.domains :
    "https://${domain}/api/github/webhooks"
  ]
}
