/* =========================
FILE OVERVIEW
========================= */
// Admin panel: edit the live catalog (categories/features/themes) and
// manage subscription PINs in bulk. Gated by admins Team membership —
// enforced for real by Appwrite permissions on platform_config and
// subscription_pins, this file just hides the screen from non-admins.
// Requires config.js, catalog.js, alert.js.

const THEME_KEYS = ["indigo", "amber", "ink", "sage", "clay", "paper"];

let workingCatalog = null;
let selectedCategoryId = null;
let allPins = [];

/* =========================
UTILITY / HELPER FUNCTIONS
========================= */
function uid() { return Math.random().toString(36).slice(2, 9); }
function esc(s) { return (s || "").toString().replace(/"/g, "&quot;"); }

function slugify(str) {
  return (str || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || uid();
}

function genPinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — easy to read aloud
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `EKI-${part()}-${part()}`;
}

/* =========================
TABS
========================= */
function showTab(name) {
  document.querySelectorAll(".admin-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".admin-panel").forEach(p => p.classList.toggle("active", p.id === `tab-${name}`));
  if (name === "pins" && !allPins.length) loadPins();
}

/* =========================
CATALOG TAB
========================= */
async function loadCatalogForAdmin() {
  await loadCatalog(); // populates CATEGORIES / GENERAL_FEATURES from Appwrite or seed (catalog.js)
  workingCatalog = {
    generalFeatures: JSON.parse(JSON.stringify(GENERAL_FEATURES)),
    categories: JSON.parse(JSON.stringify(CATEGORIES)),
    sectionLayouts: JSON.parse(JSON.stringify(SECTION_LAYOUTS)),
    components: JSON.parse(JSON.stringify(COMPONENTS))
  };
  selectedCategoryId = workingCatalog.categories[0]?.id || null;
  renderCategoryList();
  renderSectionLayouts();
  renderComponents();
  renderGeneralFeatures();
  renderCategoryForm();
}

function renderCategoryList() {
  const wrap = document.getElementById("catList");
  wrap.innerHTML = "";
  workingCatalog.categories.forEach(cat => {
    const item = document.createElement("div");
    item.className = "cat-list-item" + (cat.id === selectedCategoryId ? " active" : "");
    item.textContent = cat.label || "(untitled)";
    item.onclick = () => { selectedCategoryId = cat.id; renderCategoryList(); renderCategoryForm(); };
    wrap.appendChild(item);
  });
}

function addCategory() {
  const id = "cat-" + uid();
  workingCatalog.categories.push({ id, label: "New category", subcategories: [], specificFeatures: [], themeSet: [{ key: "indigo", name: "Modern Indigo" }] });
  selectedCategoryId = id;
  renderCategoryList();
  renderCategoryForm();
}

function deleteCategory() {
  if (!selectedCategoryId) return;
  if (!confirm("Delete this category? This can't be undone once you save.")) return;
  workingCatalog.categories = workingCatalog.categories.filter(c => c.id !== selectedCategoryId);
  selectedCategoryId = workingCatalog.categories[0]?.id || null;
  renderCategoryList();
  renderCategoryForm();
}

function currentCategory() {
  return workingCatalog.categories.find(c => c.id === selectedCategoryId);
}

function renderCategoryForm() {
  const wrap = document.getElementById("catForm");
  const cat = currentCategory();

  if (!cat) {
    wrap.innerHTML = `<p style="color:var(--muted)">No category selected. Add one to get started.</p>`;
    return;
  }

  wrap.innerHTML = `
    <div class="field-inline" style="margin-bottom:14px">
      <label>Category name</label>
      <input id="catLabel" value="${esc(cat.label)}">
    </div>
    <div class="field-inline" style="margin-bottom:14px">
      <label>Subcategories (one per line)</label>
      <textarea id="catSubs" rows="4">${esc(cat.subcategories.join("\n"))}</textarea>
    </div>
    <div style="margin-bottom:14px">
      <label style="display:block;font-size:12.5px;font-weight:600;color:var(--ink-soft);margin-bottom:8px">Category-specific sections</label>
      <div id="specFeatureRows"></div>
      <button type="button" class="repeater-add" onclick="addSpecFeatureRow()">+ Add section</button>
    </div>
    <div style="margin-bottom:18px">
      <label style="display:block;font-size:12.5px;font-weight:600;color:var(--ink-soft);margin-bottom:8px">Recommended themes (exactly what the wizard offers)</label>
      <div id="themeRows"></div>
      <button type="button" class="repeater-add" onclick="addThemeRow()">+ Add theme option</button>
    </div>
    <div style="display:flex;gap:10px">
      <button class="btn btn-primary" onclick="saveCatalog()">Save catalog</button>
      <button class="btn btn-ghost" onclick="deleteCategory()">Delete category</button>
    </div>
  `;

  document.getElementById("catLabel").addEventListener("input", e => cat.label = e.target.value);
  document.getElementById("catSubs").addEventListener("input", e => cat.subcategories = e.target.value.split("\n").map(s => s.trim()).filter(Boolean));

  renderSpecFeatureRows(cat);
  renderThemeRows(cat);
}

function renderSpecFeatureRows(cat) {
  const wrap = document.getElementById("specFeatureRows");
  wrap.innerHTML = "";
  cat.specificFeatures.forEach((f, idx) => {
    const row = document.createElement("div");
    row.className = "repeater-row";
    row.innerHTML = `
      <div class="field-inline"><input placeholder="id (e.g. appointments)" value="${esc(f.id)}" data-k="id"></div>
      <div class="field-inline"><input placeholder="Label shown to users" value="${esc(f.label)}" data-k="label"></div>
      <button type="button" class="small-btn" onclick="removeSpecFeatureRow(${idx})">Remove</button>
    `;
    row.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", e => { f[e.target.dataset.k] = e.target.value; });
    });
    wrap.appendChild(row);
  });
}

function addSpecFeatureRow() {
  currentCategory().specificFeatures.push({ id: "", label: "" });
  renderSpecFeatureRows(currentCategory());
}
function removeSpecFeatureRow(idx) {
  currentCategory().specificFeatures.splice(idx, 1);
  renderSpecFeatureRows(currentCategory());
}

function renderThemeRows(cat) {
  const wrap = document.getElementById("themeRows");
  wrap.innerHTML = "";
  cat.themeSet.forEach((t, idx) => {
    const row = document.createElement("div");
    row.className = "theme-row";
    row.innerHTML = `
      <div class="field-inline"><select data-k="key">${THEME_KEYS.map(k => `<option value="${k}" ${t.key === k ? "selected" : ""}>${k}</option>`).join("")}</select></div>
      <div class="field-inline" style="display:flex;gap:8px">
        <input placeholder="Display name (e.g. Modern Indigo)" value="${esc(t.name)}" data-k="name" style="flex:1">
        <button type="button" class="small-btn" onclick="removeThemeRow(${idx})">Remove</button>
      </div>
    `;
    row.querySelectorAll("[data-k]").forEach(inp => {
      inp.addEventListener("input", e => { t[e.target.dataset.k] = e.target.value; });
      inp.addEventListener("change", e => { t[e.target.dataset.k] = e.target.value; });
    });
    wrap.appendChild(row);
  });
}

function addThemeRow() {
  currentCategory().themeSet.push({ key: "indigo", name: "" });
  renderThemeRows(currentCategory());
}
function removeThemeRow(idx) {
  currentCategory().themeSet.splice(idx, 1);
  renderThemeRows(currentCategory());
}

function renderGeneralFeatures() {
  const wrap = document.getElementById("generalFeatureRows");
  wrap.innerHTML = "";
  workingCatalog.generalFeatures.forEach((f, idx) => {
    const row = document.createElement("div");
    row.className = "repeater-row";
    row.innerHTML = `
      <div class="field-inline"><input placeholder="id" value="${esc(f.id)}" data-k="id"></div>
      <div class="field-inline"><input placeholder="Label shown to users" value="${esc(f.label)}" data-k="label"></div>
      <button type="button" class="small-btn" onclick="removeGeneralFeature(${idx})">Remove</button>
    `;
    row.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", e => { f[e.target.dataset.k] = e.target.value; });
    });
    wrap.appendChild(row);
  });
}
function addGeneralFeature() {
  workingCatalog.generalFeatures.push({ id: "", label: "" });
  renderGeneralFeatures();
}
function removeGeneralFeature(idx) {
  workingCatalog.generalFeatures.splice(idx, 1);
  renderGeneralFeatures();
}

/* =========================
LAYOUTS TAB
========================= */
function renderSectionLayouts() {
  const wrap = document.getElementById("sectionLayoutGroups");
  wrap.innerHTML = "";

  Object.entries(workingCatalog.sectionLayouts).forEach(([sectionId, variants]) => {
    const card = document.createElement("div");
    card.className = "admin-card";
    card.style.marginBottom = "14px";
    card.innerHTML = `
      <label style="display:block;font-size:12.5px;font-weight:600;color:var(--ink-soft);margin-bottom:8px">
        Layouts for <code>${esc(sectionId)}</code>
      </label>
      <div class="layout-variant-rows"></div>
      <button type="button" class="repeater-add" onclick="addLayoutVariant('${sectionId}')">+ Add layout for ${esc(sectionId)}</button>
    `;
    const rowsWrap = card.querySelector(".layout-variant-rows");
    variants.forEach((v, idx) => {
      const row = document.createElement("div");
      row.className = "repeater-row";
      row.innerHTML = `
        <div class="field-inline"><input placeholder="id (e.g. carousel)" value="${esc(v.id)}" data-k="id"></div>
        <div class="field-inline"><input placeholder="Display name" value="${esc(v.name)}" data-k="name"></div>
        <button type="button" class="small-btn" onclick="removeLayoutVariant('${sectionId}', ${idx})">Remove</button>
      `;
      row.querySelectorAll("input").forEach(inp => {
        inp.addEventListener("input", e => { v[e.target.dataset.k] = e.target.value; });
      });
      rowsWrap.appendChild(row);
    });
    wrap.appendChild(card);
  });
}

function addLayoutVariant(sectionId) {
  workingCatalog.sectionLayouts[sectionId].push({ id: "", name: "" });
  renderSectionLayouts();
}
function removeLayoutVariant(sectionId, idx) {
  workingCatalog.sectionLayouts[sectionId].splice(idx, 1);
  renderSectionLayouts();
}
function addLayoutSectionGroup() {
  const sectionId = document.getElementById("newLayoutSectionId").value.trim();
  if (!sectionId) { showToast("Enter a section id first", "warning"); return; }
  if (workingCatalog.sectionLayouts[sectionId]) { showToast("That section already has layouts", "warning"); return; }
  workingCatalog.sectionLayouts[sectionId] = [{ id: "", name: "" }];
  document.getElementById("newLayoutSectionId").value = "";
  renderSectionLayouts();
}

/* =========================
COMPONENTS TAB
========================= */
function renderComponents() {
  const wrap = document.getElementById("componentRows");
  wrap.innerHTML = "";
  workingCatalog.components.forEach((c, idx) => {
    const row = document.createElement("div");
    row.className = "repeater-row";
    row.style.gridTemplateColumns = "1fr 1fr 1fr auto";
    row.innerHTML = `
      <div class="field-inline"><input placeholder="id" value="${esc(c.id)}" data-k="id"></div>
      <div class="field-inline"><input placeholder="Label shown to users" value="${esc(c.label)}" data-k="label"></div>
      <div class="field-inline"><input placeholder="Applies to (global or section id)" value="${esc(c.appliesTo)}" data-k="appliesTo"></div>
      <button type="button" class="small-btn" onclick="removeComponent(${idx})">Remove</button>
    `;
    row.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", e => { c[e.target.dataset.k] = e.target.value; });
    });
    wrap.appendChild(row);
  });
}
function addComponent() {
  workingCatalog.components.push({ id: "", label: "", appliesTo: "global" });
  renderComponents();
}
function removeComponent(idx) {
  workingCatalog.components.splice(idx, 1);
  renderComponents();
}

async function saveCatalog() {
  const payload = { data: JSON.stringify(workingCatalog) };
  try {
    try {
      await databases.updateDocument(DB_ID, COL_PLATFORM_CONFIG, "catalog", payload);
    } catch {
      await databases.createDocument(DB_ID, COL_PLATFORM_CONFIG, "catalog", payload);
    }
    showToast("Catalog saved — changes apply to new websites right away", "success");
  } catch (err) {
    showToast(err.message || "Could not save the catalog", "error");
  }
}

/* =========================
PINS TAB
========================= */
async function loadPins() {
  try {
    const res = await databases.listDocuments(DB_ID, COL_PINS, [Query.orderDesc("$createdAt"), Query.limit(200)]);
    allPins = res.documents;
    renderPinsTable();
  } catch (err) {
    showToast(err.message || "Could not load PINs", "error");
  }
}

function renderPinsTable() {
  const filter = document.getElementById("pinFilter").value;
  const rows = allPins.filter(p => filter === "all" || p.status === filter);
  const tbody = document.getElementById("pinsTableBody");

  tbody.innerHTML = rows.map(p => `
    <tr>
      <td><code>${p.code}</code></td>
      <td>${p.plan || ""}</td>
      <td>${p.durationDays || ""}d</td>
      <td><span class="status-tag ${p.status}">${p.status}</span></td>
      <td>${p.usedByProjectId || "—"}</td>
      <td>${p.status === "unused" ? `<button class="small-btn" onclick="disablePin('${p.$id}')">Disable</button>` : ""}</td>
    </tr>
  `).join("") || `<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:24px">No PINs match this filter.</td></tr>`;
}

async function generatePins() {
  const quantity = Math.min(parseInt(document.getElementById("pinQuantity").value) || 1, 200);
  const plan = document.getElementById("pinPlan").value.trim() || "30 days";
  const durationDays = parseInt(document.getElementById("pinDuration").value) || 30;
  const btn = document.getElementById("generatePinsBtn");

  btn.disabled = true;
  btn.textContent = "Generating…";

  try {
    for (let i = 0; i < quantity; i++) {
      await databases.createDocument(DB_ID, COL_PINS, ID.unique(), {
        code: genPinCode(),
        plan,
        durationDays,
        status: "unused"
      });
    }
    showToast(`Generated ${quantity} PIN${quantity > 1 ? "s" : ""}`, "success");
    await loadPins();
  } catch (err) {
    showToast(err.message || "Could not generate PINs", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate";
  }
}

async function disablePin(id) {
  try {
    await databases.updateDocument(DB_ID, COL_PINS, id, { status: "disabled" });
    showToast("PIN disabled", "success");
    await loadPins();
  } catch (err) {
    showToast(err.message || "Could not disable PIN", "error");
  }
}

function copyUnusedCodes() {
  const codes = allPins.filter(p => p.status === "unused").map(p => p.code).join("\n");
  if (!codes) { showToast("No unused PINs to copy", "warning"); return; }
  navigator.clipboard.writeText(codes).then(
    () => showToast("Unused codes copied to clipboard", "success"),
    () => showToast("Could not copy — select and copy manually", "error")
  );
}

/* =========================
INITIALIZATION / BOOTSTRAP
========================= */
async function initAdmin() {
  const user = await requireAuth();
  if (!user) return;

  const admin = await isAdmin();
  if (!admin) {
    document.getElementById("adminApp").classList.add("hidden");
    document.getElementById("accessGate").classList.remove("hidden");
    return;
  }

  document.getElementById("pinFilter").addEventListener("change", renderPinsTable);

  await loadCatalogForAdmin();
}

initAdmin();
