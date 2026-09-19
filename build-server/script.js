const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const mime = require("mime-types"); //determines the type of the object being stored in s3

const s3Client = new S3Client({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const PROJECT_ID = process.env.PROJECT_ID;

async function init() {
  console.log("executing script.js");
  const outDirPath = path.join(__dirname, "output");

  const p = exec(`cd ${outDirPath} && npm install && npm run build`);

  p.stdout.on("data", (data) => {
    console.log("Log: ", data.toString());
  });

  p.stderr.on("data", (data) => {
    console.log("Error: ", data.toString());
  });

  p.on("close", async () => {
    console.log("Build complete");
    const distFolderPath = path.join(__dirname, "output", "dist");
    const distFolderContents = fs.readdirSync(distFolderPath, {
      recursive: true,
    });

    for (const filePath of distFolderContents) {
      const absPath = path.join(distFolderPath, filePath);
      if (fs.lstatSync(absPath).isDirectory()) continue;
      console.log(`Uploading: ${filePath}`);
      const command = new PutObjectCommand({
        Bucket: "auto-deployment-project-output",
        Key: `__output/${PROJECT_ID}/${filePath.split(path.sep).join("/")}`,
        Body: fs.createReadStream(absPath),
        ContentType: mime.lookup(filePath) || "application/octet-stream",
      });
      await s3Client.send(command);
      console.log(`Uploaded: ${filePath}`);
    }
  });
}

init();
