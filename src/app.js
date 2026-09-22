import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { connectDb } from "./db.js";
import { Check, Upload, User } from "./models.js";
import { tokenFor, requireAuth } from "./auth.js";
import { parseChecks } from "./services/importer.js";

const app = express();
app.use(express.json({ limit: '100mb' }));

app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(",") || true }));
app.post('/auth/role-login', async (req, res) => {
  await connectDb();
  const user = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return res.status(401).json({ message: 'Invalid email or password' });
  if (user.role !== req.body.expectedRole) return res.status(403).json({ message: `Use the ${user.role} login screen for this account` });
  res.json({ token: tokenFor(user), user: { email: user.email, role: user.role } });
});

app.use(express.json({ limit: "10mb" }));
app.get("/health", (_, res) => res.json({ ok: true }));
app.post("/auth/login", async (req, res) => {
  await connectDb();
  const user = await User.findOne({
    email: String(req.body.email || "").toLowerCase(),
  });
  if (
    !user ||
    !(await bcrypt.compare(req.body.password || "", user.passwordHash))
  )
    return res.status(401).json({ message: "Invalid email or password" });
  res.json({
    token: tokenFor(user),
    user: { email: user.email, role: user.role },
  });
});
app.post("/auth/users", requireAuth(["admin"]), async (req, res) => {
  await connectDb();
  const email = String(req.body.email || "").toLowerCase();
  if (!email || !req.body.password)
    return res.status(400).json({ message: "Email and password are required" });
  try {
    const user = await User.create({
      email,
      role: req.body.role === "admin" ? "admin" : "viewer",
      passwordHash: await bcrypt.hash(req.body.password, 12),
    });
    res.status(201).json({ email: user.email, role: user.role });
  } catch {
    res.status(409).json({ message: "Email already exists" });
  }
});
app.post("/uploads", requireAuth(["admin"]), async (req, res) => {
  await connectDb();
  try {
    const csv = Buffer.from(req.body.csvBase64 || "", "base64").toString(
      "utf8",
    );
    const parsed = parseChecks(csv);
    const upload = await Upload.create({
      filename: req.body.filename || "upload.csv",
      importedBy: req.user.sub,
      totalRows: parsed.totalRows,
      acceptedRows: 0,
      rejectedRows: 0,
      rejectionReasons: parsed.reasons,
    });
    const docs = parsed.records.map((x) => ({
      ...x,
      sourceUpload: upload._id,
    }));
    let inserted = 0;
    try {
      const result = await Check.insertMany(docs, { ordered: false });
      inserted = result.length;
    } catch (error) {
      inserted = error.insertedDocs?.length || 0;
      parsed.reasons.duplicate_in_database =
        (parsed.reasons.duplicate_in_database || 0) + (docs.length - inserted);
    }
    const valid = docs.slice(0, inserted);
    await Upload.findByIdAndUpdate(upload._id, {
      acceptedRows: inserted,
      rejectedRows: parsed.totalRows - inserted,
      rejectionReasons: parsed.reasons,
      rangeStart: valid.length
        ? new Date(Math.min(...valid.map((x) => +x.checkedAt)))
        : null,
      rangeEnd: valid.length
        ? new Date(Math.max(...valid.map((x) => +x.checkedAt)))
        : null,
    });
    res
      .status(201)
      .json({
        uploadId: upload._id,
        totalRows: parsed.totalRows,
        acceptedRows: inserted,
        rejectedRows: parsed.totalRows - inserted,
        rejectionReasons: parsed.reasons,
      });
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to import CSV" });
  }
});
app.get("/checks", requireAuth(), async (req, res) => {
  await connectDb();
  const q = {};
  if (req.query.start || req.query.end) {
    q.checkedAt = {};
    if (req.query.start)
      q.checkedAt.$gte = new Date(`${req.query.start}T00:00:00.000Z`);
    if (req.query.end)
      q.checkedAt.$lte = new Date(`${req.query.end}T23:59:59.999Z`);
  }
  if (req.query.service) q.service = req.query.service;
  const page = Math.max(+req.query.page || 1, 1),
    limit = Math.min(+req.query.limit || 50, 200);
  const [items, total, services] = await Promise.all([
    Check.find(q)
      .sort({ checkedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Check.countDocuments(q),
    Check.distinct("service"),
  ]);
  res.json({ items, total, page, services });
});
app.get("/stats", requireAuth(), async (req, res) => {
  await connectDb();
  const match = {};
  if (req.query.start || req.query.end) {
    match.checkedAt = {};
    if (req.query.start)
      match.checkedAt.$gte = new Date(`${req.query.start}T00:00:00.000Z`);
    if (req.query.end)
      match.checkedAt.$lte = new Date(`${req.query.end}T23:59:59.999Z`);
  }
  const [summary] = await Check.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        failures: { $sum: { $cond: [{ $gte: ["$statusCode", 400] }, 1, 0] } },
        avgLatency: { $avg: "$latencyMs" },
        p95Values: { $push: "$latencyMs" },
      },
    },
  ]);
  const services = await Check.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$service",
        checks: { $sum: 1 },
        failures: { $sum: { $cond: [{ $gte: ["$statusCode", 400] }, 1, 0] } },
        avgLatency: { $avg: "$latencyMs" },
      },
    },
    { $sort: { failures: -1, avgLatency: -1 } },
  ]);
  const p95 = summary
    ? summary.p95Values.sort((a, b) => a - b)[
        Math.ceil(summary.p95Values.length * 0.95) - 1
      ]
    : 0;
  res.json({
    total: summary?.total || 0,
    failures: summary?.failures || 0,
    availability: summary
      ? +((1 - summary.failures / summary.total) * 100).toFixed(2)
      : 0,
    avgLatency: Math.round(summary?.avgLatency || 0),
    p95: Math.round(p95 || 0),
    services,
  });
});
app.delete('/data', requireAuth(['admin']), async (req, res) => {
  await connectDb();
  const { Check, Upload, ClearEvent } = await import('./models.js');
  const [checks, uploads] = await Promise.all([Check.countDocuments(), Upload.countDocuments()]);
  await Promise.all([Check.deleteMany({}), Upload.deleteMany({})]);
  const event = await ClearEvent.create({ clearedBy: req.user.sub, clearedByEmail: req.user.email, deletedChecks: checks, deletedUploads: uploads, reason: String(req.body?.reason || 'Manual clear from admin dashboard').slice(0, 500) });
  res.json({ message: 'Persisted monitoring data cleared', deletedChecks: checks, deletedUploads: uploads, clearEventId: event._id });
});
app.get('/data/clear-history', requireAuth(['admin']), async (_, res) => { await connectDb(); const { ClearEvent } = await import('./models.js'); res.json(await ClearEvent.find().sort({ createdAt: -1 }).limit(20).lean()); });
export default app;
