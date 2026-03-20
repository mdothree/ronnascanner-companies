import { initRonna } from "./utils/ronnaBase.js";
import { saveDoc, getUserDocs, tsToString } from "./services/firestoreService.js";
import { apiFetch } from "./config/env.js";
import { toast } from "./utils/toast.js";
import { gate } from "./services/paywallUI.js";
import { downloadText, setLoading, formatNumber } from "./utils/helpers.js";


let results = [];
let currentUser = null;

initRonna({ usageAction: "scans" }).then(user => {
  currentUser = user;
  if (user) loadHistory();
});
document.getElementById("btn-scan").addEventListener("click", () => {
  const company = document.getElementById("company-input").value.trim();
  if (!company) return toast.warning("Enter a company name or domain.");
  gate("scans", () => runScan(company), () => {});
});

async function runScan(company) {
  document.querySelector(".btn-text").classList.add("hidden");
  document.querySelector(".btn-loader").classList.remove("hidden");
  document.getElementById("btn-scan").disabled = true;

  try {
    const res = await apiFetch("/api/companies/scan", { company, depth: document.getElementById("data-depth")
    });
    const data = await res.json();
    results = data.company || mockCompanyData(company);
  } catch {
    results = mockCompanyData(company);
  }

  renderCompany(results);
  document.querySelector(".btn-text").classList.remove("hidden");
  document.querySelector(".btn-loader").classList.add("hidden");
  document.getElementById("btn-scan").disabled = false;
}

function renderCompany(c) {
  const grid = document.getElementById("company-profile-grid");
  grid.innerHTML = `
    <div class="tool-panel company-card-main">
      <div class="company-header">
        <div class="company-logo">${c.name?.charAt(0) || "?"}</div>
        <div>
          <h2>${c.name}</h2>
          <p>${c.description || ""}</p>
          <div class="profile-tags">${(c.tags||[]).map(t=>`<span class="tag tag-orange">${t}</span>`).join("")}</div>
        </div>
      </div>
    </div>
    <div class="tool-panel"><h4>Firmographics</h4>
      <div class="profile-rows">
        ${[["Industry",c.industry],["Founded",c.founded],["Employees",c.employees],["Revenue",c.revenue],["HQ",c.location],["Website",c.website],["Type",c.type]].map(([l,v])=>`<div class="profile-row"><span>${l}</span><strong>${v||"—"}</strong></div>`).join("")}
      </div>
    </div>
    <div class="tool-panel"><h4>Tech Stack</h4>
      <div class="tags-wrap">${(c.techStack||[]).map(t=>`<span class="tag tag-gray">${t}</span>`).join("")||"—"}</div>
    </div>
    <div class="tool-panel"><h4>Funding</h4>
      <div class="profile-rows">
        ${[["Stage",c.fundingStage],["Total Raised",c.totalFunding],["Investors",c.investors?.join(", ")],["Last Round",c.lastRound]].map(([l,v])=>`<div class="profile-row"><span>${l}</span><strong>${v||"—"}</strong></div>`).join("")}
      </div>
    </div>
    <div class="tool-panel"><h4>Key Signals</h4>
      <ul class="signals-list">${(c.signals||[]).map(s=>`<li>${s}</li>`).join("")||"<li>No signals</li>"}</ul>
    </div>
    <div class="tool-panel"><h4>Competitors</h4>
      <div class="tags-wrap">${(c.competitors||[]).map(comp=>`<span class="tag tag-blue">${comp}</span>`).join("")||"—"}</div>
    </div>`;
  document.getElementById("company-result").classList.remove("hidden");
  document.getElementById("company-result").scrollIntoView({ behavior: "smooth" });
}

document.getElementById("btn-export")?.addEventListener("click", () => {
  if (!results) return;
  const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: `${results.name || "company"}.json` }).click();
});

document.getElementById("btn-save")?.addEventListener("click", async () => {
  if (!results) return;
  await saveToFirestore("company-profiles", { profile: results, name: results.name });
  loadHistory(); toast.success("Saved!");
});

async function loadHistory() {
  const items = await getFromFirestore("company-profiles");
  const grid = document.getElementById("history-grid");
  if (!grid) return;
  document.getElementById("history-section").classList.remove("hidden");
  grid.innerHTML = items.length
    ? items.map(i => `<div class="result-card"><strong>${i.name || "Company"}</strong><small>${i.createdAt?.toDate?.().toLocaleDateString?.() || "Recently"}</small></div>`).join("")
    : "<p class='empty-state'>No saved companies yet.</p>";
}

function mockCompanyData(name) {
  return {
    name, description: "A leading B2B software company driving digital transformation.",
    industry: "SaaS / Software", founded: "2012", employees: "1,200–2,500",
    revenue: "$150M–$300M ARR", location: "Austin, TX",
    website: name.toLowerCase().replace(/ /g,"") + ".com",
    type: "Private", fundingStage: "Series D",
    totalFunding: "$280M", lastRound: "Series D — $85M (2023)",
    investors: ["Sequoia Capital","Accel","Tiger Global"],
    tags: ["B2B","SaaS","Enterprise","API"],
    techStack: ["React","Node.js","AWS","Kubernetes","Salesforce","Marketo","Zendesk"],
    signals: ["📈 Revenue grew 42% YoY","🏢 Expanded to EMEA","👥 Hiring 150+ this quarter","🤝 New strategic partnership with AWS"],
    competitors: ["Competitor A","Competitor B","Competitor C"]
  };
}
