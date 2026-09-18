const { exec } = require("child_process");
const path = require("path");
async function init() {
  console.log("executing script.js");
  const outDirPath = path.join(__dirname, "output");

  const p = exec(`cd ${outDirPath} && npm install && npm run build`);

  p.stdout.on("data", (data) => {
    console.log("Log: ", data.toString);
  });

  p.stdout.on("error", (data) => {
    console.log("Error: ", data.toString);
  });

  p.on("close", () => {
    console.log("Build complete");
  });
}
