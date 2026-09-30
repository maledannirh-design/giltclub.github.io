const fs = require("fs");
const path = require("path");
const { BetaAnalyticsDataClient } = require("@google-analytics/data");

const propertyId = process.env.GA4_PROPERTY_ID;

if (!propertyId) {
  throw new Error("Missing GA4_PROPERTY_ID");
}

const client = new BetaAnalyticsDataClient();

function parseRows(response) {
  return (response.rows || [])
    .map((row) => ({
      country: row.dimensionValues?.[0]?.value || "(not set)",
      countryCode: row.dimensionValues?.[1]?.value || "",
      newUsers: Number(row.metricValues?.[0]?.value || 0),
      engagementRate: Number(row.metricValues?.[1]?.value || 0),
      eventCount: Number(row.metricValues?.[2]?.value || 0)
    }))
    .filter((row) => row.country !== "(not set)")
    .sort((a, b) => b.newUsers - a.newUsers);
}

function parseRealtimeRows(response) {
  return (response.rows || [])
    .map((row) => ({
      country: row.dimensionValues?.[0]?.value || "(not set)",
      countryCode: row.dimensionValues?.[1]?.value || "",
      activeUsers: Number(row.metricValues?.[0]?.value || 0)
    }))
    .filter((row) => row.activeUsers > 0)
    .sort((a, b) => b.activeUsers - a.activeUsers);
}

async function main() {
  const property = `properties/${propertyId}`;

  const [lifetimeResponse] = await client.runReport({
    property,
    dateRanges: [
      {
        startDate: "2015-08-14",
        endDate: "today"
      }
    ],
    dimensions: [
      { name: "country" },
      { name: "countryId" }
    ],
    metrics: [
      { name: "newUsers" },
      { name: "engagementRate" },
      { name: "eventCount" }
    ],
    orderBys: [
      {
        metric: { metricName: "newUsers" },
        desc: true
      }
    ],
    limit: 300
  });

  const [realtimeResponse] = await client.runRealtimeReport({
    property,
    dimensions: [
      { name: "country" },
      { name: "countryId" }
    ],
    metrics: [
      { name: "activeUsers" }
    ],
    orderBys: [
      {
        metric: { metricName: "activeUsers" },
        desc: true
      }
    ],
    limit: 100
  });

  const payload = {
    lifetime: parseRows(lifetimeResponse),
    realtime: parseRealtimeRows(realtimeResponse),
    generatedAt: new Date().toISOString()
  };

  const outputPath = path.join(
    process.cwd(),
    "data",
    "digital-reach.json"
  );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  fs.writeFileSync(
    outputPath,
    JSON.stringify(payload, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `Digital Reach updated: ${payload.lifetime.length} lifetime countries, ${payload.realtime.length} live countries.`
  );
}

main().catch((error) => {
  console.error("Digital Reach update failed:", error);
  process.exit(1);
});
