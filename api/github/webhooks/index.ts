import pino from "pino";
import { createNodeMiddleware, createProbot } from "probot";
import app from "../../../src/app.js";

// Workaround for logs are not being printed in Vercel serverless functions
const log = pino(
  {
    level: process.env.LOG_LEVEL || "info",
  },
  {
    write: (msg: string) => {
      console.log(msg.trim());
    },
  },
);
const probot = createProbot({ overrides: { log } });

export default createNodeMiddleware(app, {
  probot,
  webhooksPath: "/api/github/webhooks",
});
