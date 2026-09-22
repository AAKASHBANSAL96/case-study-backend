import mongoose from "mongoose";
const checkSchema = new mongoose.Schema(
  {
    checkedAt: { type: Date, required: true, index: true },
    service: { type: String, required: true, index: true },
    statusCode: { type: Number, required: true },
    latencyMs: { type: Number, required: true },
    agent: String,
    region: String,
    sourceUpload: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Upload",
      required: true,
    },
    fingerprint: { type: String, required: true },
  },
  { timestamps: true },
);
checkSchema.index(
  { checkedAt: 1, service: 1, agent: 1, region: 1, fingerprint: 1 },
  { unique: true },
);
const uploadSchema = new mongoose.Schema(
  {
    filename: String,
    importedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    totalRows: Number,
    acceptedRows: Number,
    rejectedRows: Number,
    rejectionReasons: Object,
    rangeStart: Date,
    rangeEnd: Date,
  },
  { timestamps: true },
);
const userSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, lowercase: true, trim: true },
    passwordHash: String,
    role: { type: String, enum: ["admin", "viewer"], default: "viewer" },
  },
  { timestamps: true },
);
const clearEventSchema = new mongoose.Schema(
  {
    clearedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clearedByEmail: { type: String, required: true },
    deletedChecks: { type: Number, required: true },
    deletedUploads: { type: Number, required: true },
    reason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);
export const Check =
  mongoose.models.Check || mongoose.model("Check", checkSchema);
export const Upload =
  mongoose.models.Upload || mongoose.model("Upload", uploadSchema);
export const User = mongoose.models.User || mongoose.model("User", userSchema);
export const ClearEvent =
  mongoose.models.ClearEvent || mongoose.model("ClearEvent", clearEventSchema);
