// pm2 processes for Moxie Jobs on the VPS (same setup as GoMoxie: GitHub Action → git pull → build → pm2).
// All settings come from the repo-root .env (the API and worker load ../../.env from their folder).
//   pm2 startOrRestart ecosystem.config.cjs --update-env && pm2 save
module.exports = {
  apps: [
    {
      name: "moxie-jobs-api",
      cwd: "./apps/api",
      script: "dist/main.js",
      env: { NODE_ENV: "production" },
      max_memory_restart: "600M",
    },
    {
      // Exactly one: it holds the Telegram user session that reads the channels.
      name: "moxie-jobs-worker",
      cwd: "./apps/worker",
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "700M",
    },
    {
      name: "moxie-jobs-web",
      cwd: "./apps/web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3003",
      env: { NODE_ENV: "production" },
      max_memory_restart: "600M",
    },
  ],
};
