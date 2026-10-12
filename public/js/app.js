import { initRonna } from "./utils/ronnaBase.js";
import { authService } from "./services/authService.js";
import { saveDoc, getUserDocs, tsToString } from "./services/firestoreService.js";
import { apiFetch } from "./config/env.js";
import { toast } from "./utils/toast.js";
import { gate } from "./services/paywallUI.js";
import { downloadText, setLoading, formatNumber, escapeHtml } from "./utils/helpers.js";


let results = [];
let currentUser = null;

initRonna({ usageAction: "scans" }).then(user => {
  currentUser = user;
  if (user) loadHistory();
});
document.getElementById("btn-scan").addEventListener("click", () => {
  const company = document.getElementById("filter-company").value.trim();
  if (!company) return toast.warning("Enter a company name or domain.");
  gate("scans", () => runScan(company), () => {});
});

async function runScan(company) {
  document.querySelector(".btn-text").classList.add("hidden");
  document.querySelector(".btn-loader").classList.remove("hidden");
  document.getElementById("btn-scan").disabled = true;

  try {
    const data = await apiFetch("/api/companies/scan", {
      company,
      dataPoints: Array.from(document.getElementById("filter-data")?.selectedOptions || [], o => o.value)
    });
    results = data?.company || null;
  } catch {
    results = null;
  }

  if (results) renderCompany(results); else showUnavailable();
  document.querySelector(".btn-text").classList.remove("hidden");
  document.querySelector(".btn-loader").classList.add("hidden");
  document.getElementById("btn-scan").disabled = false;
}

function renderCompany(c) {
  const grid = document.getElementById("company-report");
  grid.innerHTML = `
    <div class="tool-panel company-card-main">
      <div class="company-header">
        <div class="company-logo">${escapeHtml(c.name?.charAt?.(0) || "?")}</div>
        <div>
          <h2>${escapeHtml(c.name)}</h2>
          <p>${escapeHtml(c.description)}</p>
          <div class="profile-tags">${(c.tags||[]).map(t=>`<span class="tag tag-orange">${escapeHtml(t)}</span>`).join("")}</div>
        </div>
      </div>
    </div>
    <div class="tool-panel"><h4>Firmographics</h4>
      <div class="profile-rows">
        ${[["Industry",c.industry],["Founded",c.founded],["Employees",c.employees],["Revenue",c.revenue],["HQ",c.location],["Website",c.website],["Type",c.type]].map(([l,v])=>`<div class="profile-row"><span>${escapeHtml(l)}</span><strong>${escapeHtml(v||"—")}</strong></div>`).join("")}
      </div>
    </div>
    <div class="tool-panel"><h4>Tech Stack</h4>
      <div class="tags-wrap">${(c.techStack||[]).map(t=>`<span class="tag tag-gray">${escapeHtml(t)}</span>`).join("")||"—"}</div>
    </div>
    <div class="tool-panel"><h4>Funding</h4>
      <div class="profile-rows">
        ${[["Stage",c.fundingStage],["Total Raised",c.totalFunding],["Investors",c.investors?.join(", ")],["Last Round",c.lastRound]].map(([l,v])=>`<div class="profile-row"><span>${escapeHtml(l)}</span><strong>${escapeHtml(v||"—")}</strong></div>`).join("")}
      </div>
    </div>
    <div class="tool-panel"><h4>Key Signals</h4>
      <ul class="signals-list">${(c.signals||[]).map(s=>`<li>${escapeHtml(s)}</li>`).join("")||"<li>No signals</li>"}</ul>
    </div>
    <div class="tool-panel"><h4>Competitors</h4>
      <div class="tags-wrap">${(c.competitors||[]).map(comp=>`<span class="tag tag-blue">${escapeHtml(comp)}</span>`).join("")||"—"}</div>
    </div>`;
  document.getElementById("results-panel").classList.remove("hidden");
  document.getElementById("results-panel").scrollIntoView({ behavior: "smooth" });
}

document.getElementById("btn-export")?.addEventListener("click", () => {
  if (!results) return;
  const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: `${results.name || "company"}.json` }).click();
});

document.getElementById("btn-save")?.addEventListener("click", async () => {
  if (!results) return;
  if (!(await saveToFirestore("company-profiles", { profile: results, name: results.name }))) return;
  loadHistory(); toast.success("Saved!");
});

async function loadHistory() {
  const grid = document.getElementById("history-grid");
  if (!grid) return; // no history UI on this page
  const items = await getFromFirestore("company-profiles");
  document.getElementById("history-section").classList.remove("hidden");
  grid.innerHTML = items.length
    ? items.map(i => `<div class="result-card"><strong>${escapeHtml(i.name || "Company")}</strong><small>${escapeHtml(i.createdAt?.toDate?.().toLocaleDateString?.() || "Recently")}</small></div>`).join("")
    : "<p class='empty-state'>No saved companies yet.</p>";
}

// RONNA-MOCK-FALLBACK: never fabricate results when the scanner API is unavailable.
function showUnavailable() {
  // Render into the report container so the Export/Save toolbar stays intact for a retry.
  results = null;
  document.getElementById("results-panel")?.classList.remove("hidden");
  const report = document.getElementById("company-report");
  if (report) report.innerHTML = '<div class="empty-state" role="status"><p><strong>The scanner service is unavailable right now.</strong></p><p>No results were generated. Please try again later.</p></div>';
  toast.error("Scanner service unavailable. No results were generated.");
}

// RONNA-LOADLIST-AWAIT-BUG (same class on this sub): saveToFirestore / getFromFirestore
// (and downloadFile / toCSV where used) were called but never defined → ReferenceError on
// Save / history load. Defined here on top of the shared Firestore service.
async function saveToFirestore(collectionName, data) {
  const user = authService.currentUser();
  if (!user) { document.getElementById("auth-modal")?.classList.remove("hidden"); return false; }
  try {
    await saveDoc(collectionName, user.uid, data);
    return true;
  } catch (e) {
    toast.error("Could not save. Please try again.");
    return false;
  }
}

async function getFromFirestore(collectionName) {
  const user = authService.currentUser();
  if (!user) return [];
  try {
    return await getUserDocs(collectionName, user.uid);
  } catch (e) {
    console.warn("[ronna] could not load history", e);
    return [];
  }
}
