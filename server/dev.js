// npm run dev : runs the whole site on http://localhost:3000 with a throwaway in-memory MongoDB.
// Data resets on every restart. Use `npm start` with a real MONGO_URI for persistent data.
require("dotenv").config();
process.env.JWT_SECRET ||= require("crypto").randomBytes(32).toString("hex"); // random per run: dev only
// throwaway in-memory DB, so a fixed dev login is fine (and never the real staff login from .env)
process.env.SEED_STAFF_EMAIL = "staff@mediassist.dev";
process.env.SEED_STAFF_PASSWORD = "dev-staff-12345";
(async () => {
  const { MongoMemoryServer } = require("mongodb-memory-server");
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  await require("mongoose").connect(process.env.MONGO_URI);
  await require("./seed")();
  console.log(`Staff login: ${process.env.SEED_STAFF_EMAIL} / ${process.env.SEED_STAFF_PASSWORD}`);
  await require("./index").start();
})().catch((e) => { console.error(e); process.exit(1); });
