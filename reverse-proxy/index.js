const express = require("express");
const httpProxy = require("http-proxy");
const app = express();

const PORT = 8000;
const BASE_PATH = `https://auto-deployment-project-output.s3.ap-south-1.amazonaws.com/__output/`;

const proxy = httpProxy.createProxy();
app.use((req, res) => {
  const hostname = req.hostname;
  const subdomain = hostname.split(".")[0];

  const resolveTo = `${BASE_PATH}/${subdomain}`;

  proxy.web(req, res, { target: resolveTo, changeOrigin: true });
});
//to automatically route request to entry file
proxy.on("proxyReq", (proxyReq, req, res) => {
  const url = req.url;
  if (url === "/") {
    proxyReq.path += "index.html";
  }
});

app.listen(PORT, () => {
  console.log(`running reverse proxy at port ${PORT}`);
});
