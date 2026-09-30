# GMTC Digital Reach — Setup

The public page is already wired to:

- lifetime GA4 country data
- realtime GA4 visitors by country
- lifetime Firestore Sponsor Clicks

The GA4 Data API must stay server-side. The frontend calls the Firebase Cloud Function:

`getDigitalReach`

## 1. Find the numeric GA4 Property ID

In Google Analytics:

Admin → Property Settings → Property ID

Use the numeric Property ID, not the `G-EPM3YNG89N` Measurement ID.

## 2. Enable Google Analytics Data API

Enable the Google Analytics Data API v1 for the Google Cloud project used by Firebase.

## 3. Give the function access to GA4

The Cloud Function runs with a Google service account. That service account must have access to the GMTC Google Analytics property.

Grant it a read role in Google Analytics, such as Viewer.

## 4. Deploy the function

From the repository root:

```bash
firebase login
firebase use giltianappsmobile
firebase deploy --only functions:getDigitalReach
```

During deployment, Firebase will ask for:

`GA4_PROPERTY_ID`

Enter the numeric GA4 Property ID.

The function is configured for:

`asia-southeast1`

and the expected endpoint is:

`https://asia-southeast1-giltianappsmobile.cloudfunctions.net/getDigitalReach`

## 5. Verify

Open the endpoint in a browser after deployment.

It should return JSON containing:

- `lifetime`
- `realtime`
- `generatedAt`

The website will refresh the dashboard every 60 seconds.

## Important

The dashboard intentionally does not display a "Last 28 Days" label.

The lifetime report asks GA4 for data from 2000-01-01 through today. In practice, this represents the lifetime data available to that GA4 property/API rather than guaranteeing data older than the property's available history.

Realtime data is separate from lifetime data and is used only for the LIVE VISITORS card and live map dots.
