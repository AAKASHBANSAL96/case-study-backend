import mongoose from "mongoose";
let connection;
export async function connectDb() {
  if (connection) return connection;
  connection = await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000,
  });
  return connection;
}
