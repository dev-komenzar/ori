import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 5173);

createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("hello from myapp (scenario-smoke)");
}).listen(port, "0.0.0.0", () => {
  console.log(`myapp listening on :${port}`);
});
