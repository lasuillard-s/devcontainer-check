output "webhook_urls" {
  description = "Webhook URLs you can use for your GitHub App. Pick one of the URLs that does not change often."
  value = [
    for domain in resource.vercel_deployment.app.domains :
    "https://${domain}/api/github/webhooks"
  ]
}
