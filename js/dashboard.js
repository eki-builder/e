/* =========================
FILE OVERVIEW
========================= */
// Dashboard: lists the user's website projects, shows trial/subscription
// status, and handles subscription PIN activation.
// Subscription state is read-only here — every write goes through the
// subscription_manager Appwrite Function (see config.js / README-APPWRITE.md).
// Requires config.js, alert.js.

let currentUser = null;
let activePinProjectId = null;

/* =========================
UTILITY / HELPER FUNCTIONS
========================= */
function daysLeft(dateStr) {
  const diff = new Date(dateStr) - new Date();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function subscriptionStatusFor(sub) {
  const now = new Date();

  if (!sub) return { label: "Setting up…", cls: "trial" };

  if (sub.status === "active" && sub.expiresAt && new Date(sub.expiresAt) > now) {
    return { label: "Active", cls: "active" };
  }
  if (sub.status === "trial" && sub.trialEndsAt && new Date(sub.trialEndsAt) > now) {
    return { label: `Trial · ${daysLeft(sub.trialEndsAt)}d left`, cls: "trial" };
  }
  return { label: "Expired", cls: "expired" };
}

function themeGradientClass(theme) {
  const map = { indigo: "theme-indigo", amber: "theme-amber", ink: "theme-ink", sage: "theme-sage", clay: "theme-clay", paper: "theme-paper" };
  return map[theme] || "theme-indigo";
}

/* =========================
CORE BUSINESS LOGIC
========================= */
async function loadProjects() {
  const res = await databases.listDocuments(DB_ID, COL_PROJECTS, [
    Query.equal("userId", currentUser.$id),
    Query.orderDesc("$createdAt")
  ]);

  const projects = res.documents;
  const subs = await loadSubscriptions(projects);

  renderProjects(projects, subs);
  renderOverallBanner(projects, subs);
}

// Reads (never writes) the subscriptions collection. If a project somehow
// has no subscription doc yet (e.g. it was created before this existed),
// this asks the server function to provision one — still no client write.
async function loadSubscriptions(projects) {
  const subs = {};

  await Promise.all(projects.map(async (project) => {
    try {
      subs[project.$id] = await databases.getDocument(DB_ID, COL_SUBSCRIPTIONS, project.$id);
    } catch {
      try {
        const result = await callSubscriptionManager("ensure_trial", { projectId: project.$id });
        subs[project.$id] = result.subscription;
      } catch (err) {
        console.warn("Could not provision trial for", project.$id, err.message);
      }
    }
  }));

  return subs;
}

async function activatePin() {
  const codeInput = document.getElementById("pinCode");
  const code = codeInput.value.trim().toUpperCase();
  const btn = document.getElementById("activatePinBtn");

  if (!code) {
    showToast("Enter a PIN code", "warning");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Activating…";

  try {
    const result = await callSubscriptionManager("activate_pin", {
      projectId: activePinProjectId,
      code
    });

    showToast(result.message || "Subscription activated", "success");
    closePinModal();
    loadProjects();

  } catch (err) {
    showToast(err.message || "Could not activate PIN", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Activate";
  }
}

/* =========================
UI INTERACTION LOGIC
========================= */
function renderOverallBanner(projects, subs) {
  const el = document.getElementById("dashBanner");
  if (!projects.length) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");

  const statuses = projects.map(p => subscriptionStatusFor(subs[p.$id]).cls);
  const anyExpired = statuses.includes("expired");
  const anyTrial = statuses.includes("trial");

  if (anyExpired) {
    el.className = "banner expired";
    el.innerHTML = `<div><strong>Some sites need attention</strong><p>One or more of your websites is inactive. Activate a subscription PIN to bring it back online.</p></div>`;
  } else if (anyTrial) {
    el.className = "banner trial";
    el.innerHTML = `<div><strong>You're on a free trial</strong><p>Your trial site is live now. Activate a PIN any time to keep it running after the trial ends.</p></div>`;
  } else {
    el.className = "banner";
    el.innerHTML = `<div><strong>All set</strong><p>Your websites are active and running.</p></div>`;
  }
}

function renderProjects(projects, subs) {
  const wrap = document.getElementById("projectGrid");
  wrap.innerHTML = "";

  projects.forEach(project => {
    const status = subscriptionStatusFor(subs[project.$id]);
    const canPublish = status.cls === "trial" || status.cls === "active";
    const card = document.createElement("div");
    card.className = "project-card";
    card.innerHTML = `
      <div class="project-thumb ${themeGradientClass(project.theme)}"></div>
      <div class="project-body">
        <h3>${project.businessName || "Untitled website"}</h3>
        <p>${project.category || ""}${project.subcategory ? " · " + project.subcategory : ""}</p>
        <span class="pill ${status.cls}">${status.label}</span>
        ${project.publishedUrl ? `<p style="margin-top:8px"><a href="${project.publishedUrl}" target="_blank">${project.publishedUrl.replace(/^https?:\/\//, "")}</a></p>` : ""}
        <div class="project-actions">
          <a class="btn btn-ghost" href="preview.html?pid=${project.$id}">Preview</a>
          <a class="btn btn-ghost" href="create.html?pid=${project.$id}">Edit</a>
          ${status.cls === "expired" ? `<button class="btn btn-primary" onclick="openPinModal('${project.$id}')">Activate</button>` : ""}
        </div>
        ${canPublish ? `<button class="btn btn-dark btn-block" style="margin-top:10px" onclick="publishProject('${project.$id}', this)">${project.publishedUrl ? "Re-publish to GitHub" : "Publish to GitHub"}</button>` : ""}
      </div>
    `;
    wrap.appendChild(card);
  });

  const createCard = document.createElement("a");
  createCard.href = "create.html";
  createCard.className = "create-card";
  createCard.innerHTML = `<div class="plus">+</div><h3>Create a new website</h3><p>Answer a few questions to get started</p>`;
  wrap.appendChild(createCard);
}

async function publishProject(projectId, btn) {
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Publishing…";

  try {
    const result = await callSiteExport(projectId);
    showToast("Published! Your site is live.", "success");
    window.open(result.publishedUrl, "_blank");
    loadProjects();
  } catch (err) {
    showToast(err.message || "Could not publish this website", "error");
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

function openPinModal(projectId) {
  activePinProjectId = projectId;
  document.getElementById("pinModal").classList.remove("hidden");
}
function closePinModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById("pinModal").classList.add("hidden");
  document.getElementById("pinCode").value = "";
}

/* =========================
INITIALIZATION / BOOTSTRAP
========================= */
async function initDashboard() {
  currentUser = await requireAuth();
  if (!currentUser) return;

  document.getElementById("userInitial").textContent = (currentUser.name || currentUser.email)[0].toUpperCase();
  document.getElementById("userName").textContent = currentUser.name || currentUser.email;

  if (await isAdmin()) {
    document.getElementById("adminLink").classList.remove("hidden");
  }

  await loadProjects();
}

initDashboard();
