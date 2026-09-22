import { parse } from "csv-parse/sync";
const aliases = {
  checkedAt: ["timestamp", "checked_at", "datetime", "date_time", "time"],
  service: ["service", "service_id", "service_name", "endpoint", "system"],
  statusCode: ["status_code", "http_status", "status", "code"],
  latencyMs: ["latency_ms", "response_latency", "response_time", "latency"],
  agent: ["agent", "agent_id", "monitoring_agent"],
  region: ["region", "location", "agent_region"],
};
const normalize = (key) =>
  key
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
function columns(headers) {
  const set = Object.fromEntries(headers.map((h) => [normalize(h), h]));
  return Object.fromEntries(
    Object.entries(aliases).map(([name, options]) => [
      name,
      options.map((x) => set[x]).find(Boolean),
    ]),
  );
}
export function parseChecks(csv) {
  const rows = parse(csv.replace(/^\uFEFF/, ""), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
  if (!rows.length) throw new Error("CSV has no check records");
  const map = columns(Object.keys(rows[0]));
  for (const field of ["checkedAt", "service", "statusCode", "latencyMs"])
    if (!map[field])
      throw new Error(`CSV is missing a recognizable ${field} column`);
  const reasons = {},
    records = [],
    seen = new Set();
  for (const row of rows) {
    const checkedAt = new Date(row[map.checkedAt]),
      service = String(row[map.service] || "").trim(),
      statusCode = Number(row[map.statusCode]),
      latencyMs = Number(String(row[map.latencyMs]).replace(/ms$/i, "").trim()),
      agent = map.agent ? String(row[map.agent] || "").trim() : "unknown",
      region = map.region ? String(row[map.region] || "").trim() : "unknown";
    const error = Number.isNaN(checkedAt.valueOf())
      ? "invalid_timestamp"
      : !service
        ? "missing_service"
        : !Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599
          ? "invalid_status_code"
          : !Number.isFinite(latencyMs) || latencyMs < 0
            ? "invalid_latency"
            : null;
    if (error) {
      reasons[error] = (reasons[error] || 0) + 1;
      continue;
    }
    const fingerprint = `${checkedAt.toISOString()}|${service}|${statusCode}|${latencyMs}|${agent}|${region}`;
    if (seen.has(fingerprint)) {
      reasons.duplicate_in_file = (reasons.duplicate_in_file || 0) + 1;
      continue;
    }
    seen.add(fingerprint);
    records.push({
      checkedAt,
      service,
      statusCode,
      latencyMs,
      agent: agent || "unknown",
      region: region || "unknown",
      fingerprint,
    });
  }
  return { records, totalRows: rows.length, reasons };
}
