const express = require("express");
const { generateSlug } = require("random-word-slugs");
const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");
const dotenv = require("dotenv");
const Redis = require("ioredis");
const { Server } = require("socket.io");

const PORT = 5000;
const PROXY_PORT = process.env.PROXY_PORT || 8000;
dotenv.config();
const app = express();
const config = {
  CLUSTER: process.env.CLUSTER_ARN,
  TASK: process.env.TASK_ARN,
};
const ecsClient = new ECSClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const subscriber = new Redis(process.env.REDIS_URL);

const io = new Server({ cors: { origin: "*" } });

io.on("connection", (socket) => {
  socket.on("subscribe", (channel) => {
    socket.join(channel);
    socket.emit(`message`, `joined: ${channel}`);
  });
});
io.listen(5001, () => {
  console.log("socket server running on 5001");
});

app.use(express.json());

app.post("/project", async (req, res) => {
  const { gitURL, slug } = req.body;
  if (!gitURL) {
    return res.status(400).json({ error: "gitURL is required" });
  }
  const projectSlug = slug ? slug : generateSlug();
  //spins the container
  const command = new RunTaskCommand({
    cluster: config.CLUSTER,
    taskDefinition: config.TASK,
    launchType: "FARGATE",
    count: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        assignPublicIp: "ENABLED",
        subnets: [
          "subnet-02d2ccdc4139aebb1",
          "subnet-0a7102664fbf39eaf",
          "subnet-081c75b344309c9fa",
        ],
        securityGroups: ["sg-03114e2162838fde6"],
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: "builder-image",
          environment: [
            { name: "GIT_REPOSITORY_URL", value: gitURL },
            { name: "PROJECT_ID", value: projectSlug },
            { name: "AWS_ACCESS_KEY", value: process.env.AWS_ACCESS_KEY },
            {
              name: "AWS_SECRET_ACCESS_KEY",
              value: process.env.AWS_SECRET_ACCESS_KEY,
            },
            {
              name: "REDIS_URL",
              value: process.env.REDIS_URL,
            },
          ],
        },
      ],
    },
  });
  await ecsClient.send(command);

  return res.json({
    status: "queued",
    data: {
      projectSlug,
      url: `http://${projectSlug}.localhost:${PROXY_PORT}`,
    },
  });
});

const initRedisSubscribe = async () => {
  await subscriber.psubscribe("logs:*");
  console.log("subscribed to redis");
  subscriber.on("pmessage", (pattern, channel, message) => {
    io.to(channel).emit("message", message);
  });
};

initRedisSubscribe();

app.listen(PORT, () => {
  console.log(`api server running on port ${PORT}`);
});
