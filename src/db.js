import mongoose from "mongoose";
let connection;
export async function connectDb() {
  if (connection) return connection;
  if (!process.env.MONGODB_URI || typeof process.env.MONGODB_URI !== "string") {
    throw new Error("Missing MONGODB_URI. Set it in backend/.env locally or Railway service Variables in production.");
  }
  connection = await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000,
  });
  return connection;
}
