import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";

const DATA_URL = "./data/digital-reach.json";
const COUNTRY_COORDS = {
  ID:[-2.5,118], US:[37.1,-95.7], IN:[22.6,79], SE:[62,15],
  DE:[51.2,10.4], CN:[35.9,104.2], JP:[36.2,138.3], CA:[56.1,-106.3],
  IE:[53.4,-8.2], GB:[55.4,-3.4], FR:[46.2,2.2], NL:[52.1,5.3],
  BE:[50.8,4.5], CH:[46.8,8.2], AT:[47.5,14.5], IT:[41.9,12.6],
  ES:[40.5,-3.7], PT:[39.4,-8.2], NO:[60.5,8.5], DK:[56.3,9.5],
  FI:[64.0,26], PL:[51.9,19.1], CZ:[49.8,15.5], AU:[-25.3,133.8],
  NZ:[-40.9,174.9], SG:[1.35,103.8], MY:[4.2,101.9], TH:[15.9,100.9],
  VN:[14.1,108.3], PH:[12.9,121.8], KR:[35.9,127.8], TW:[23.7,120.9],
  HK:[22.3,114.2], AE:[23.4,53.8], SA:[23.9,45.1], QA:[25.3,51.2],
  TR:[38.9,35.2], PK:[30.4,69.3], BD:[23.7,90.4], LK:[7.9,80.8],
  BR:[-10.8,-51.9], AR:[-38.4,-63.6], CL:[-35.7,-71.5], MX:[23.6,-102.5],
  CO:[4.6,-74.3], PE:[-9.2,-75], ZA:[-30.6,22.9], NG:[9.1,8.7],
  EG:[26.8,30.8], KE:[0.2,37.9]
};

const byId = id => document.getElementById(id);
const countryCode = row => String(row.countryCode || row.countryId || "").trim().toUpperCase();
const countryName = row => String(row.country || "").trim() || "UNKNOWN";
const project = (lat, lon) => ({ x:((Number(lon)+180)/360)*1000, y:((90-Number(lat))/180)*500 });

function renderMap(lifetimeRows, liveRows) {
  const lifetimeLayer = byId("reachMapDots");
  const liveLayer = byId("reachLiveDots");
  if (!lifetimeLayer || !liveLayer) return;
  lifetimeLayer.innerHTML = lifetimeRows.map(row => {
    const coords = COUNTRY_COORDS[countryCode(row)];
    if (!coords) return "";
    const p = project(coords[0], coords[1]), users = Number(row.newUsers || 0);
    return `<circle class="reach-map-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${users > 100 ? 5 : users > 25 ? 4 : 3}"><title>${countryName(row)} — ${users.toLocaleString("en-US")} new users</title></circle>`;
  }).join("");
  liveLayer.innerHTML = liveRows.map(row => {
    const coords = COUNTRY_COORDS[countryCode(row)];
    if (!coords) return "";
    const p = project(coords[0], coords[1]);
    return `<circle class="reach-live-map-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5"><title>${countryName(row)} — live visitor</title></circle>`;
  }).join("");
}

function renderTable(rows) {
  const body = byId("digitalReachTableBody");
  if (!body) return;
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="4" class="reach-empty">NO COUNTRY DATA IN THE PUBLISHED GA4 SNAPSHOT</td></tr>';
    return;
  }
  body.innerHTML = rows.map((row, index) => `<tr class="reach-row-enter" style="animation-delay:${Math.min(index,10)*35}ms"><td>${countryName(row)}</td><td>${Number(row.newUsers||0).toLocaleString("en-US")}</td><td>${(Number(row.engagementRate||0)*100).toFixed(1)}%</td><td>${Number(row.eventCount||0).toLocaleString("en-US")}</td></tr>`).join("");
}

function renderLiveVisitors(rows) {
  const countEl = byId("digitalLiveVisitors"), countriesEl = byId("digitalLiveCountries");
  if (!countEl || !countriesEl) return;
  countEl.textContent = rows.reduce((sum,row)=>sum+Number(row.activeUsers||0),0).toLocaleString("en-US");
  const countries = [...new Set(rows.filter(row=>Number(row.activeUsers||0)>0).map(countryName))];
  countriesEl.textContent = countries.length ? countries.join(" · ").toUpperCase() : "NO ACTIVE VISITORS";
}

async function loadSponsorClicks() {
  const target = byId("digitalSponsorClicks");
  if (!target) return;
  try {
    const snap = await getDoc(doc(db,"websiteStats","Summary"));
    target.textContent = Number(snap.exists() ? snap.data().sponsorClicks || 0 : 0).toLocaleString("en-US");
  } catch (error) {
    console.error("Digital Reach sponsor clicks error:", error);
    target.textContent = "—";
  }
}

async function loadDigitalReach() {
  const status = byId("digitalReachStatus");
  if (!status) return;
  status.textContent = "LOADING";
  status.classList.remove("ready");
  await loadSponsorClicks();
  try {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache:"no-store" });
    if (!response.ok) throw new Error(`Digital Reach JSON returned HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.lifetime)) throw new Error("Published Digital Reach JSON has no lifetime array");
    const lifetimeRows = payload.lifetime;
    const liveRows = Array.isArray(payload.realtime) ? payload.realtime : [];
    renderMap(lifetimeRows, liveRows);
    renderTable(lifetimeRows);
    renderLiveVisitors(liveRows);
    status.textContent = "LIVE";
    status.classList.add("ready");
  } catch (error) {
    console.error("Digital Reach loading error:", error);
    status.textContent = "DATA UNAVAILABLE";
    const body = byId("digitalReachTableBody");
    if (body) body.innerHTML = '<tr><td colspan="4" class="reach-empty">DIGITAL REACH DATA COULD NOT BE LOADED. PLEASE TRY AGAIN LATER.</td></tr>';
    renderLiveVisitors([]);
  }
}

loadDigitalReach();
setInterval(loadDigitalReach, 60000);
