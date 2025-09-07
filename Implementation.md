## Dashboard Analytics: Product Trends and Visitor Logs

This document explains the design and implementation of the analytics additions for the backend: database schema changes and two new dashboard endpoints with bucket-based, date-range filtering. It is written to reflect the practical steps taken (local MySQL via Docker, Prisma migrations, and route/controller work) and to serve as a clear handover note for internship evaluation.


## My approach

1) Understand the current server structure
- Reviewed `server/app.js` to confirm existing router wiring and the base path: `/api/*`.
- Identified the place to add a new router: `/api/dashboard`.
- Added a controller module that encapsulates analytics logic: bucketing, date normalization in UTC, and Prisma queries.

2) Choose a data model that scales
- Introduced a pre-aggregated table `product_trends` to avoid repeatedly running heavy queries across the full `Product` history. Each row represents the state/change for a single day (or ingest point), with `totalProducts`, `productsAdded`, and `productsRemoved`.
- Introduced `visitor_logs` as an append-only log to record visits with timestamp and optional metadata.
- Added indexes on date columns for efficient range scans and bucketing.

3) Implement bucketed analytics
- Implemented a shared bucketing utility that builds contiguous buckets for day/week/month in UTC, normalizes start/end boundaries to their bucket edges, and returns both `startDate` and `endDate` for each bucket.
- For product trends: aggregates additions/removals within each bucket and forward-fills `totalProducts` where data is missing, so charts do not “drop” to null.
- For visitors: counts visits per bucket over the `visitor_logs` table.

4) Validate with sample ranges and defaults
- When `startDate`/`endDate` are omitted, sensible defaults are applied per bucket (recent days/weeks/months).
- Ensured responses include both `startDate` and `endDate` in each bucket, as required.


## Schema changes (Prisma + MySQL)

Two new Prisma models were added in `server/prisma/schema.prisma` and mapped to snake-case tables for clarity in the database.

```prisma
model ProductTrend {
	id              String   @id @default(uuid())
	date            DateTime
	totalProducts   Int      @default(0)
	productsAdded   Int      @default(0)
	productsRemoved Int      @default(0)

	@@index([date])
	@@map("product_trends")
}

model VisitorLog {
	id        String   @id @default(uuid())
	visitedAt DateTime @default(now())
	ip        String?
	userAgent String?
	path      String?

	@@index([visitedAt])
	@@map("visitor_logs")
}
```

Notes
- `@@map` is used to define explicit table names (`product_trends`, `visitor_logs`).
- Indexes on `date`/`visitedAt` support efficient `WHERE ... BETWEEN` for bucketing and reduce full scans.
- `ProductTrend` provides pre-aggregated daily (or ingest-time) values; the API code further groups them into week/month buckets when requested.


## Local database setup and migrations

1) Start MySQL locally via Docker (Windows PowerShell)

```powershell
docker run -d `
	-e MYSQL_ROOT_PASSWORD=suhas `
	-e MYSQL_DATABASE=academy_db `
	-e MYSQL_PASSWORD=academy_pass `
	-p 3307:3306 `
	mysql:oraclelinux9
```

2) Configure Prisma connection string
- `.env` (already present):

```properties
DATABASE_URL=mysql://root:suhas@localhost:3307/academy_db
```

3) Run Prisma migration and generate client
- From the `server/` directory:

```powershell
# Create a migration for the new tables and apply it to the DB
npx prisma migrate dev --name add_product_trends_and_visitor_logs

# (Re)generate Prisma Client
npx prisma generate
```

4) Optional: seed demo data
- A demo data script exists at `server/utills/insertDemoData.js` for `Category`/`Product` content.
- You can also insert sample rows into `product_trends` and `visitor_logs` to visualize charts during development.


## API details

Base path: `/api/dashboard`

### 1) GET `/api/dashboard/products`

Purpose
- Returns the current total number of products and a trend array bucketed by day/week/month over a date range.

Query Parameters
- `startDate` (optional, `YYYY-MM-DD`)
- `endDate` (optional, `YYYY-MM-DD`)
- `bucket` (optional, one of: `day`, `week`, `month`; default: `day`)

Behavior and bucketing rules
- Dates are processed in UTC to avoid timezone drift.
- When omitted:
	- `bucket=day`: last 7 days (inclusive).
	- `bucket=week`: last 12 ISO weeks.
	- `bucket=month`: last 6 calendar months.
- Each bucket object includes `startDate` and `endDate` as `YYYY-MM-DD` strings for chart axes.
- `totalProducts` is forward-filled from the last known value so missing days/weeks do not break charts.

Sample response

```json
{
	"currentTotal": 128,
	"trend": [
		{
			"startDate": "2025-09-01",
			"endDate": "2025-09-01",
			"totalProducts": 120,
			"productsAdded": 5,
			"productsRemoved": 2
		},
		{
			"startDate": "2025-09-02",
			"endDate": "2025-09-02",
			"totalProducts": 123,
			"productsAdded": 3,
			"productsRemoved": 0
		},
		{
			"startDate": "2025-09-03",
			"endDate": "2025-09-03",
			"totalProducts": 128,
			"productsAdded": 6,
			"productsRemoved": 1
		}
	]
}
```

Implementation
- Controller: `getDashboardProductsHandler` in `server/controllers/dashboard_controller.js`.
- Data source: `prisma.productTrend.findMany()` filtered by `date` between the normalized range.
- Per-bucket aggregation: sums `productsAdded` and `productsRemoved`, and sets `totalProducts` to the last record in the bucket, then forward-fills missing totals across buckets.


### 2) GET `/api/dashboard/visitors`

Purpose
- Returns total visitors and bucketed counts over a date range.

Query Parameters
- `startDate` (optional, `YYYY-MM-DD`)
- `endDate` (optional, `YYYY-MM-DD`)
- `bucket` (optional, one of: `day`, `week`, `month`; default: `day`)

Behavior and bucketing rules
- Same UTC normalization as the products endpoint.
- Each bucket object includes `startDate` and `endDate`.

Sample response

```json
{
	"totalVisitors": 452,
	"visitorsByBucket": [
		{
			"startDate": "2025-09-01",
			"endDate": "2025-09-01",
			"visitors": 120
		},
		{
			"startDate": "2025-09-02",
			"endDate": "2025-09-02",
			"visitors": 150
		},
		{
			"startDate": "2025-09-03",
			"endDate": "2025-09-03",
			"visitors": 182
		}
	]
}
```

Implementation
- Controller: `getDashboardVisitorsHandler` in `server/controllers/dashboard_controller.js`.
- Data source: `prisma.visitorLog.findMany()` filtered by `visitedAt` between the normalized range.
- Per-bucket aggregation: counts logs whose `visitedAt` falls within a bucket.


## Routing and wiring

- `server/app.js` registers the dashboard router under `/api/dashboard`:
	- `GET /api/dashboard/products` → `getDashboardProductsHandler`
	- `GET /api/dashboard/visitors` → `getDashboardVisitorsHandler`
- Ensure your `routes/dashboard.js` file exports these routes and imports the two controller functions.


## Optional features attempted / future enhancements

- Visitor logging middleware: add an Express middleware to record `ip`, `userAgent`, and `path` for each request into `visitor_logs` (respecting privacy and compliance). This enables organic population of the visitors chart.
- Admin/cron job for trends: add a scheduled job that derives `productsAdded`/`productsRemoved` daily from product mutations to keep `product_trends` up-to-date.
- Input validation: enforce strict validation on `startDate`, `endDate`, and `bucket` using a lightweight schema validator.
- Timezone-awareness: for deployments requiring local-time bucketing, allow a `tz` parameter and convert to/from UTC.


## Notes on correctness and performance

- UTC normalization prevents off-by-one errors around midnight and daylight saving.
- Date indexes (`@@index([date])`, `@@index([visitedAt])`) ensure range queries are efficient.
- Pre-aggregation via `product_trends` keeps requests fast and predictable even as the `Product` table grows.


## Quick testing (optional)

```powershell
# Products (last 7 days by default)
curl "http://localhost:3001/api/dashboard/products"

# Products with explicit range and weekly buckets (ISO weeks)
curl "http://localhost:3001/api/dashboard/products?startDate=2025-07-01&endDate=2025-09-01&bucket=week"

# Visitors (last 7 days by default)
curl "http://localhost:3001/api/dashboard/visitors"

# Visitors for a month range grouped by month
curl "http://localhost:3001/api/dashboard/visitors?startDate=2025-04-01&endDate=2025-09-01&bucket=month"
```


## Summary

- Added two tables via Prisma: `product_trends` and `visitor_logs`, indexed on date columns.
- Implemented two endpoints under `/api/dashboard` that support `startDate`, `endDate`, and `bucket` with UTC-normalized bucketing and both `startDate`/`endDate` in responses.
- Verified locally with Dockerized MySQL and Prisma migrations.