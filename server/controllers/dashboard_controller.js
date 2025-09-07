const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function getDashboardProductsHandler(req, res) {
    try {
        const { startDate, endDate, bucket = 'day' } = req.query;

        const { rangeStart, rangeEnd, buckets } = buildBuckets({ startDate, endDate, bucket });

        const trends = await prisma.productTrend.findMany({
            where: {
                date: {
                    gte: rangeStart,
                    lte: rangeEnd,
                },
            },
            orderBy: { date: 'asc' },
        });

        const trendByBucket = buckets.map(({ start, end }) => {
            const items = trends.filter(t => t.date >= start && t.date <= end);
            const productsAdded = items.reduce((sum, it) => sum + (it.productsAdded || 0), 0);
            const productsRemoved = items.reduce((sum, it) => sum + (it.productsRemoved || 0), 0);
            const last = items.length ? items[items.length - 1] : null;
            return {
                startDate: fmt(start),
                endDate: fmt(end),
                totalProducts: last ? last.totalProducts : null,
                productsAdded,
                productsRemoved,
            };
        });

        let lastTotal = null;
        for (let i = 0; i < trendByBucket.length; i++) {
            if (trendByBucket[i].totalProducts == null) {
                trendByBucket[i].totalProducts = lastTotal ?? 0;
            } else {
                lastTotal = trendByBucket[i].totalProducts;
            }
        }

        const currentTotal = await prisma.product.count();

        return res.json({
            currentTotal,
            trend: trendByBucket,
        });
    }
    catch (error) {
        return res.status(500).json({ error: "Internal server error" });
    }
}

async function getDashboardVisitorsHandler(req, res) {
    try {
        const { startDate, endDate, bucket = 'day' } = req.query;

        const { rangeStart, rangeEnd, buckets } = buildBuckets({ startDate, endDate, bucket });

        const logs = await prisma.visitorLog.findMany({
            where: {
                visitedAt: {
                    gte: rangeStart,
                    lte: rangeEnd,
                },
            },
            orderBy: { visitedAt: 'asc' },
        });

        const visitorsByBucket = buckets.map(({ start, end }) => {
            const count = logs.reduce((acc, l) => acc + ((l.visitedAt >= start && l.visitedAt <= end) ? 1 : 0), 0);
            return {
                startDate: fmt(start),
                endDate: fmt(end),
                visitors: count,
            };
        });

        const totalVisitors = logs.length;

        return res.json({
            totalVisitors,
            visitorsByBucket,
        });
    }
    catch (error) {
        return res.status(500).json({ error: "Internal server error" });
    }
}

// Helper Functions
function toUTCDateOnly(dateStr) {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function fmt(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

function startOfDayUTC(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfDayUTC(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function startOfISOWeekUTC(d) {
    const day = d.getUTCDay() || 7; // 1..7, Monday=1..Sunday=7
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - (day - 1));
    return startOfDayUTC(start);
}

function endOfISOWeekUTC(d) {
    const start = startOfISOWeekUTC(d);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return endOfDayUTC(end);
}

function startOfMonthUTC(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonthUTC(d) {
    return endOfDayUTC(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

function addDaysUTC(d, days) {
    const res = new Date(d);
    res.setUTCDate(res.getUTCDate() + days);
    return res;
}

function addMonthsUTC(d, months) {
    const res = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    res.setUTCMonth(res.getUTCMonth() + months);
    return res;
}

function buildBuckets({ startDate, endDate, bucket }) {
    const now = new Date();
    let rangeStart = toUTCDateOnly(startDate);
    let rangeEnd = toUTCDateOnly(endDate);

    if (!rangeEnd) rangeEnd = startOfDayUTC(now);
    if (!rangeStart) {
        if (bucket === 'month') {
            const tmp = new Date(rangeEnd);
            tmp.setUTCMonth(tmp.getUTCMonth() - 5);
            rangeStart = startOfMonthUTC(tmp);
        } else if (bucket === 'week') {
            const tmp = new Date(rangeEnd);
            tmp.setUTCDate(tmp.getUTCDate() - 7 * 11);
            rangeStart = startOfISOWeekUTC(tmp);
        } else {
            const tmp = new Date(rangeEnd);
            tmp.setUTCDate(tmp.getUTCDate() - 6);
            rangeStart = startOfDayUTC(tmp);
        }
    }

    // Normalize boundaries to bucket edges
    let cursor;
    let makeBucket;
    let advance;
    if (bucket === 'month') {
        rangeStart = startOfMonthUTC(rangeStart);
        rangeEnd = endOfMonthUTC(rangeEnd);
        cursor = new Date(rangeStart);
        makeBucket = (d) => ({ start: startOfMonthUTC(d), end: endOfMonthUTC(d) });
        advance = (d) => addMonthsUTC(d, 1);
    } else if (bucket === 'week') {
        rangeStart = startOfISOWeekUTC(rangeStart);
        rangeEnd = endOfISOWeekUTC(rangeEnd);
        cursor = new Date(rangeStart);
        makeBucket = (d) => ({ start: startOfISOWeekUTC(d), end: endOfISOWeekUTC(d) });
        advance = (d) => addDaysUTC(d, 7);
    } else {
        rangeStart = startOfDayUTC(rangeStart);
        rangeEnd = endOfDayUTC(rangeEnd);
        cursor = new Date(rangeStart);
        makeBucket = (d) => ({ start: startOfDayUTC(d), end: endOfDayUTC(d) });
        advance = (d) => addDaysUTC(d, 1);
    }

    const buckets = [];
    while (cursor <= rangeEnd) {
        const b = makeBucket(cursor);
        buckets.push(b);
        cursor = advance(cursor);
    }

    return { rangeStart, rangeEnd, buckets };
}

module.exports = {
    getDashboardProductsHandler,
    getDashboardVisitorsHandler
}