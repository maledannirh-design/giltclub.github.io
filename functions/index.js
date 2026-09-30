const { onRequest } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");
const { BetaAnalyticsDataClient } = require("@google-analytics/data");

const GA4_PROPERTY_ID = defineString("GA4_PROPERTY_ID");

const analyticsDataClient =
  new BetaAnalyticsDataClient();

function parseLifetimeRows(response){
  return (response.rows || [])
    .map(row => ({
      country:
        row.dimensionValues?.[0]?.value || "(not set)",
      countryCode:
        row.dimensionValues?.[1]?.value || "",
      newUsers:
        Number(row.metricValues?.[0]?.value || 0),
      engagementRate:
        Number(row.metricValues?.[1]?.value || 0),
      eventCount:
        Number(row.metricValues?.[2]?.value || 0)
    }))
    .filter(row => row.country !== "(not set)")
    .sort((a,b) => b.newUsers - a.newUsers);
}

function parseRealtimeRows(response){
  return (response.rows || [])
    .map(row => ({
      country:
        row.dimensionValues?.[0]?.value || "(not set)",
      countryCode:
        row.dimensionValues?.[1]?.value || "",
      activeUsers:
        Number(row.metricValues?.[0]?.value || 0)
    }))
    .filter(row => row.activeUsers > 0)
    .sort((a,b) => b.activeUsers - a.activeUsers);
}

exports.getDigitalReach = onRequest(
  {
    region: "asia-southeast1",
    cors: [
      "https://giltclub.my.id",
      "https://www.giltclub.my.id"
    ]
  },
  async (req,res) => {

    try{

      const property =
        `properties/${GA4_PROPERTY_ID.value()}`;

      const [lifetimeResponse] =
        await analyticsDataClient.runReport({
          property,
          dateRanges: [
            {
              startDate: "2000-01-01",
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
              metric: {
                metricName: "newUsers"
              },
              desc: true
            }
          ],
          limit: 300
        });

      const [realtimeResponse] =
        await analyticsDataClient.runRealtimeReport({
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
              metric: {
                metricName: "activeUsers"
              },
              desc: true
            }
          ],
          limit: 100
        });

      res.set("Cache-Control","no-store");

      res.status(200).json({
        lifetime:
          parseLifetimeRows(lifetimeResponse),

        realtime:
          parseRealtimeRows(realtimeResponse),

        generatedAt:
          new Date().toISOString()
      });

    }catch(error){

      console.error(
        "GMTC Digital Reach error:",
        error
      );

      res.status(500).json({
        error:
          "Unable to load Google Analytics data."
      });

    }

  }
);
