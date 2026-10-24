const { onRequest } = require("firebase-functions/v2/https");
const app = require("./backend/server").default;

exports.api = onRequest({
  cors: true,
  region: "asia-south1",
  timeoutSeconds: 60,
  maxInstances: 10,
}, app);
