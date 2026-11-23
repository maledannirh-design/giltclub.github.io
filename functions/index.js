const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
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
    serviceAccount:
      "giltclub-ga4-reader@giltianappsmobile.iam.gserviceaccount.com",
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


/* =========================================================
   GMTC TRAINING REGISTRATION
   Server-side validation, four-seat class cap and invoice email
========================================================= */
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const trainingDb = admin.firestore();

function gmtcWitaDateKey(date = new Date()){
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function escapeTrainingHtml(value){
  return String(value).replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
}

exports.registerTrainingParticipant = onCall(
  { region: "asia-southeast1" },
  async request => {
    const data = request.data || {};
    const fullName = String(data.fullName || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
    const phone = String(data.phone || "").trim();
    const classId = String(data.classId || "").trim();
    const paymentDueDate = String(data.paymentDueDate || "").trim();

    const classes = {
      class01: {
        label: "CLASS 01",
        title: "NEWBIE TO UPPER BEGINNER",
        summary: "Build tennis foundations, rally skills, fundamental strokes, movement, and recreational match play."
      },
      class02: {
        label: "CLASS 02",
        title: "BREAK THE LIMITS — INTERMEDIATE ENTRY LEVEL",
        summary: "Develop consistency, ball control, movement efficiency, point construction, and better decisions."
      },
      class03: {
        label: "CLASS 03",
        title: "LOWER INTERMEDIATE TO UPPER INTERMEDIATE",
        summary: "Develop advanced ball quality, tactical patterns, match adaptation, and decision-making under pressure."
      }
    };

    if (!fullName || fullName.length > 100) {
      throw new HttpsError("invalid-argument", "Please enter a valid full name.");
    }
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length > 160) {
      throw new HttpsError("invalid-argument", "Please enter a valid email address.");
    }
    if (!phone || phone.length > 25) {
      throw new HttpsError("invalid-argument", "Please enter a valid mobile number.");
    }
    if (!classes[classId]) {
      throw new HttpsError("invalid-argument", "Please select a valid training class.");
    }
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(paymentDueDate)) {
      throw new HttpsError("invalid-argument", "Please select a valid payment due date.");
    }

    const today = gmtcWitaDateKey();
    const maxDate = new Date(today + "T00:00:00+08:00");
    maxDate.setDate(maxDate.getDate() + 10);
    const maxDateKey = gmtcWitaDateKey(maxDate);
    if (paymentDueDate < today || paymentDueDate > maxDateKey) {
      throw new HttpsError("invalid-argument", "Payment due date must be within 10 days from today (WITA).");
    }

    const selectedClass = classes[classId];
    const registrationRef = trainingDb.collection("trainingRegistrations").doc();
    const mailRef = trainingDb.collection("mail").doc();
    const classQuery = trainingDb.collection("trainingRegistrations")
      .where("classId", "==", classId);

    await trainingDb.runTransaction(async transaction => {
      const classSnapshot = await transaction.get(classQuery);
      const activeRegistrations = classSnapshot.docs.filter(doc =>
        !["CANCELLED", "REJECTED"].includes(String(doc.get("status") || "").toUpperCase())
      );
      if (activeRegistrations.length >= 4) {
        throw new HttpsError("resource-exhausted", "This class has reached its maximum capacity of 4 participants.");
      }
      const duplicate = activeRegistrations.some(doc =>
        String(doc.get("email") || "").toLowerCase() === email
      );
      if (duplicate) {
        throw new HttpsError("already-exists", "This email is already registered for this class.");
      }

      const amount = 1400000;
      const dueLabel = new Date(paymentDueDate + "T00:00:00+08:00")
        .toLocaleDateString("id-ID", {
          timeZone: "Asia/Makassar",
          day: "numeric",
          month: "long",
          year: "numeric"
        });
      const safeName = escapeTrainingHtml(fullName);
      const safeClass = escapeTrainingHtml(selectedClass.label + " — " + selectedClass.title);
      const safeDue = escapeTrainingHtml(dueLabel);
      const amountLabel = "Rp " + amount.toLocaleString("id-ID");
      const subject = "GMTC Training Registration & Invoice — " + selectedClass.label;
      const textBody =
        "Hello " + fullName + ",\\n\\n" +
        "You have successfully registered for " + selectedClass.label + " — " + selectedClass.title + ".\\n" +
        "Invoice amount: " + amountLabel + "\\n" +
        "Payment due date: " + dueLabel + "\\n\\n" +
        "Each class has a maximum of 4 participants. Each session lasts 2 hours and participants receive a learning module for every session.\\n\\n" +
        "After registration, a GMTC admin will invite you to the class group.\\n\\n" +
        "Thank you,\\nGMTC — Community Learning & Development";
      const htmlBody = `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#24372b;max-width:600px;margin:auto;line-height:1.6">
          <div style="background:#245b38;color:#fff;padding:24px;text-align:center">
            <div style="font-size:12px;letter-spacing:2px">GMTC COMMUNITY LEARNING &amp; DEVELOPMENT</div>
            <h1 style="margin:8px 0 0;font-size:24px">REGISTRATION CONFIRMED</h1>
          </div>
          <div style="padding:24px;border:1px solid #e6dfd1">
            <p>Hello <strong>${safeName}</strong>,</p>
            <p>You have successfully registered as a participant in:</p>
            <h2 style="color:#245b38">${safeClass}</h2>
            <div style="background:#f6f0e4;padding:18px;border-radius:10px">
              <div style="font-size:12px;color:#687469">TRAINING INVOICE</div>
              <div style="font-size:28px;font-weight:bold;color:#245b38">${amountLabel}</div>
              <p style="margin-bottom:0"><strong>Payment due date:</strong> ${safeDue}</p>
            </div>
            <h3>Training package information</h3>
            <ul>
              <li>Maximum 4 participants in each class</li>
              <li>Each session lasts 2 hours</li>
              <li>A learning module is provided for every session</li>
            </ul>
            <p>After your registration, a GMTC admin will contact you and invite you to the class group.</p>
            <p>Please complete your payment by the due date stated above. Keep this email as your registration and invoice record.</p>
            <p>Thank you,<br><strong>GMTC — Community Learning &amp; Development</strong></p>
          </div>
          <div style="padding:14px;text-align:center;color:#899187;font-size:11px">This is an automated email. Please do not reply.</div>
        </div>`;

      transaction.set(registrationRef, {
        registrationId: registrationRef.id,
        fullName,
        email,
        phone,
        classId,
        classLabel: selectedClass.label,
        classTitle: selectedClass.title,
        amount,
        currency: "IDR",
        paymentDueDate,
        status: "PENDING_PAYMENT",
        source: "main_website",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      transaction.set(mailRef, {
        to: email,
        message: { subject, text: textBody, html: htmlBody }
      });
    });

    return {
      success: true,
      registrationId: registrationRef.id,
      message: "Registration created and invoice email queued."
    };
  }
);
