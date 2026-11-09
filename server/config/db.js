const mongoose = require("mongoose");

async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error("MONGODB_URI is required to connect to MongoDB.");
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.info(`MongoDB connected: ${mongoose.connection.name}`);
}

module.exports = connectDB;
