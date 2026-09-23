# Health Check Dashboard Backend

Backend API for importing service health-check CSV data, validating and cleaning it, storing it in MongoDB, and serving data for an operations dashboard.


Health check: `http://52.5.202.29:3001/health`

For an EC2 deployment without a domain: `http://52.5.202.29:3001`

## Architecture

```text
Upload UI
    |
    | POST /uploads with filename and base64-encoded CSV
    v
Express API (Node.js)
    |
    | Authenticate admin, decode, parse, validate, and clean CSV
    v
MongoDB
    |
    | Authenticated queries and aggregations
    v
Dashboard
    |-- GET /checks       paginated check records
    |-- GET /stats        totals, failures, availability, average latency, p95
    |-- GET /data/clear-history
```

The upload UI sends the CSV as `csvBase64` in a JSON request. The backend authenticates the request, decodes the CSV, validates each row, records upload statistics, and inserts accepted checks into MongoDB. The dashboard reads persisted records through the authenticated API.

The Express application runs locally or in Docker on EC2 through `src/local.js`. `src/lambda.js` is the alternative Serverless/Lambda adapter.

## Technology and Service Choices

- **Node.js 20**: Matches the project engine requirement and provides a stable API runtime.
- **Express**: Provides simple HTTP routing, JSON handling, middleware, and authentication integration.
- **MongoDB with Mongoose**: Fits the check-record structure and supports indexes, uniqueness, and aggregations.
- **`csv-parse`**: Provides reliable CSV parsing with headers, trimming, empty-line handling, and relaxed column counts.
- **JWT**: Provides stateless authentication for dashboard requests with eight-hour expiry.
- **bcryptjs**: Hashes user passwords before storage.
- **Docker**: Packages the runtime and dependencies consistently for EC2.
- **AWS EC2**: Provides a persistent host for the Dockerized Express service.
- **External MongoDB/Atlas**: Keeps the database managed separately from the application container.
- **CORS**: Controls which configured frontend origins may call the browser API.

## Data-Quality Problems Found

The importer handles these issues in the supplied CSV format:

- UTF-8 byte-order marks at the beginning of a file.
- Empty rows.
- Whitespace around headers and values.
- Header aliases such as `timestamp`, `checked_at`, `datetime`, `status_code`, `response_time`, and `service_name`.
- Missing required columns: timestamp, service, status code, or latency.
- Invalid or unparseable timestamps.
- Missing service names.
- Status codes that are not integers or are outside `100` to `599`.
- Latency values that are non-numeric, negative, or contain a trailing `ms` suffix.
- Missing optional agent and region values.
- Duplicate records within one CSV file.
- Records already present in the database.
- Rows with a different number of columns than the header.

## Validation and Cleaning

1. The file is decoded from base64 and parsed as CSV with headers.
2. Headers are trimmed, lowercased, and normalized by replacing spaces and hyphens with underscores.
3. Required columns are mapped through accepted aliases.
4. Values are converted to a `Date`, trimmed service string, integer status code, and finite non-negative latency number. A trailing `ms` is removed from latency.
5. Missing agent and region values become `unknown`.
6. Invalid rows are skipped and counted by reason; they are not inserted into MongoDB.
7. A fingerprint made from timestamp, service, status code, latency, agent, and region removes duplicates within the upload.
8. MongoDB has a unique compound index to prevent duplicate checks from being inserted again.
9. Each upload stores total, accepted, rejected, rejection reasons, and date range values.

The importer does not guess corrections for invalid timestamps, missing services, invalid status codes, or invalid latency values. Those rows are rejected to avoid inaccurate dashboard data.

## Assumptions

- `statusCode` is an HTTP status code and must be between `100` and `599`.
- Latency is measured in milliseconds.
- A check is unique when timestamp, service, status code, latency, agent, and region match.
- Missing agent and region values are acceptable and stored as `unknown`.
- The first CSV row contains column headers.
- Only admins can upload files, create users, or clear persisted data.
- The frontend and backend are deployed separately and communicate through the API URL.
- MongoDB credentials are supplied through environment variables.
- The current upload endpoint uses base64 JSON with a 100 MB body limit. Very large files should eventually use streaming multipart upload or object storage.
- The p95 metric is calculated from latency values returned by the MongoDB aggregation for the selected range.

## API Summary

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Service health check |
| `POST` | `/auth/login` | Public | Login with email and password |
| `POST` | `/auth/role-login` | Public | Login while checking expected role |
| `POST` | `/auth/users` | Admin | Create a viewer or admin user |
| `POST` | `/uploads` | Admin | Import a base64-encoded CSV |
| `GET` | `/checks` | Authenticated | List filtered, paginated checks |
| `GET` | `/stats` | Authenticated | Return dashboard metrics |
| `DELETE` | `/data` | Admin | Clear checks and uploads with an audit event |
| `GET` | `/data/clear-history` | Admin | List recent clear events |

## Local Setup

Requirements: Node.js 20, npm 10 or newer, and MongoDB or a MongoDB Atlas connection string.

```bash
npm ci
```

Create `.env` in this directory:

```env
PORT=3001
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>
JWT_SECRET=<long-random-secret>
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<strong-password>
FRONTEND_ORIGIN=http://localhost:5173
```

Start and verify the backend:

```bash
npm start
curl http://localhost:3001/health
```

The configured admin is created automatically on startup if it does not exist. The standalone command is also available:

```bash
npm run seed:admin
```

## Docker and EC2 Deployment

Build and run locally:

```bash
docker build -t earthre-backend .
docker run -d \
  --name earthre-backend \
  --restart unless-stopped \
  --env-file .env \
  -p 3001:3001 \
  earthre-backend
```

On Amazon Linux EC2:

```bash
sudo dnf update -y
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Log in again after adding the user to the Docker group. Copy or clone this repository, create `.env`, then run:

```bash
cd ~/backend
docker build -t earthre-backend .
docker rm -f earthre-backend 2>/dev/null || true
docker run -d \
  --name earthre-backend \
  --restart unless-stopped \
  --env-file .env \
  -p 3001:3001 \
  earthre-backend
```

Check the deployment:

```bash
docker ps
docker logs --tail 100 earthre-backend
curl http://localhost:3001/health
```

The EC2 security group must allow the API port, or preferably ports `80` and `443` when a reverse proxy such as Nginx is configured. MongoDB Atlas must allow the EC2 public IP or configured network range.

## Redeployment

After changing the code:

```bash
git pull
docker build -t earthre-backend:latest .
docker rm -f earthre-backend
docker run -d \
  --name earthre-backend \
  --restart unless-stopped \
  --env-file .env \
  -p 3001:3001 \
  earthre-backend:latest
```

For production, publish tagged images to Amazon ECR and pull immutable version tags on EC2 instead of relying only on `latest`.

## Optional Serverless Deployment

`src/lambda.js` is an alternative entrypoint for AWS Lambda through Serverless Framework. It is not used by the EC2 Docker deployment.

```bash
npm install
npm run deploy
```

The Serverless deployment requires `MONGODB_URI` and `JWT_SECRET` in the deployment environment. EC2 uses `npm start`, which runs `src/local.js`.

## Improvements With More Time

- Replace base64 JSON uploads with streaming multipart uploads or S3 to reduce memory usage.
- Add unit tests for every importer validation and duplicate scenario.
- Add integration tests covering login, upload, MongoDB persistence, dashboard queries, and audit history.
- Add rate limiting, structured logging, request IDs, and centralized error handling.
- Add a reverse proxy with HTTPS, a domain name, and automatic certificate renewal on EC2.
- Move p95 calculation to a more scalable aggregation or precomputed metrics model for very large datasets.
- Add asynchronous import status and progress reporting for large files.
- Add a rejected-row download report and import schema versioning.
- Add CI/CD to build, scan, tag, and deploy Docker images automatically.
- Add monitoring and alerts for container health, database connectivity, failed imports, and EC2 resources.