/* =========================
FILE OVERVIEW
========================= */
// Multi-step website creation wizard: category -> subcategory -> features
// -> recommendation -> content form -> review & launch.
// Requires config.js, catalog.js, alert.js.

const TOTAL_STEPS = 6;

let state = {
  projectId: null,
  category: null,
  subcategory: null,
  features: new Set(["about", "contact"]), // sensible defaults, always useful
  theme: null,
  siteStructure: "single", // "single" | "multi" — chosen in Step 03
  sectionLayouts: {},      // { sectionId: layoutId } — set when a recommendation is picked
  components: [],          // component ids — set when a recommendation is picked
  content: {
    businessName: "",
    phone: "",
    email: "",
    about: "",
    logoFileId: null,
    social: { facebook: "", instagram: "", twitter: "", whatsappNumber: "" },
    mapsEmbed: "",
    services: [],
    testimonials: [],
    team: [],
    faqs: [],
    pricing: [],
    gallery: [],
    blogPosts: [],
    downloads: []
  }
};

let currentStep = 1;
let currentUser = null;

/* =========================
UTILITY / HELPER FUNCTIONS
========================= */
function uid() { return Math.random().toString(36).slice(2, 9); }

function goToStep(n) {
  currentStep = n;
  document.querySelectorAll(".wiz-panel").forEach(p => p.classList.remove("active"));
  document.getElementById(`panel-${n}`).classList.add("active");

  document.querySelectorAll(".progress-step").forEach((el, i) => {
    el.classList.toggle("done", i + 1 < n);
    el.classList.toggle("current", i + 1 === n);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (n === 2) renderSubcategoryStep();
  if (n === 3) renderFeatureStep();
  if (n === 4) renderRecommendations();
  if (n === 5) renderContentForm();
  if (n === 6) renderReview();
}

function canProceed(step) {
  if (step === 1 && !state.category) { showToast("Choose a category to continue", "warning"); return false; }
  if (step === 2 && !state.subcategory) { showToast("Choose a type to continue", "warning"); return false; }
  if (step === 4 && !state.theme) { showToast("Pick one of the three recommendations", "warning"); return false; }
  if (step === 5 && !state.content.businessName.trim()) { showToast("Business name is required", "warning"); return false; }
  return true;
}

function next() {
  if (!canProceed(currentStep)) return;
  if (currentStep === 5) syncContentFromForm();
  if (currentStep < TOTAL_STEPS) goToStep(currentStep + 1);
}
function back() { if (currentStep > 1) goToStep(currentStep - 1); }

/* =========================
STEP 1 — CATEGORY
========================= */
function renderCategoryStep() {
  const grid = document.getElementById("categoryGrid");
  grid.innerHTML = "";
  CATEGORIES.forEach(cat => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "select-card" + (state.category === cat.id ? " selected" : "");
    card.innerHTML = `<h4>${cat.label}</h4><p>${cat.subcategories.slice(0, 2).join(", ")}…</p>`;
    card.onclick = () => {
      state.category = cat.id;
      state.subcategory = null;
      state.theme = null;
      renderCategoryStep();
    };
    grid.appendChild(card);
  });
}

/* =========================
STEP 2 — SUBCATEGORY
========================= */
function renderSubcategoryStep() {
  const grid = document.getElementById("subcategoryGrid");
  grid.innerHTML = "";
  if (!state.category) return;
  const cat = getCategory(state.category);
  document.getElementById("subcategoryCatName").textContent = cat.label;

  cat.subcategories.forEach(sub => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "select-card" + (state.subcategory === sub ? " selected" : "");
    card.innerHTML = `<h4>${sub}</h4>`;
    card.onclick = () => {
      state.subcategory = sub;
      renderSubcategoryStep();
    };
    grid.appendChild(card);
  });
}

/* =========================
STEP 3 — FEATURES
========================= */
function renderFeatureStep() {
  const wrap = document.getElementById("featureWrap");
  wrap.innerHTML = "";

  const structureTitle = document.createElement("div");
  structureTitle.className = "feature-section-title";
  structureTitle.textContent = "Site structure";
  wrap.appendChild(structureTitle);
  wrap.appendChild(buildStructureToggle());

  const generalTitle = document.createElement("div");
  generalTitle.className = "feature-section-title";
  generalTitle.textContent = "General sections";
  wrap.appendChild(generalTitle);
  wrap.appendChild(buildCheckGrid(GENERAL_FEATURES));

  if (state.category) {
    const cat = getCategory(state.category);
    const specificTitle = document.createElement("div");
    specificTitle.className = "feature-section-title";
    specificTitle.textContent = `${cat.label} specific`;
    wrap.appendChild(specificTitle);
    wrap.appendChild(buildCheckGrid(cat.specificFeatures));
  }
}

function buildStructureToggle() {
  const grid = document.createElement("div");
  grid.className = "select-grid narrow";

  const options = [
    { id: "single", title: "Single page", desc: "Everything on one page, sections linked by menu" },
    { id: "multi",  title: "Multiple pages", desc: "Separate page per section — Home, About, Gallery…" }
  ];

  options.forEach(opt => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "select-card" + (state.siteStructure === opt.id ? " selected" : "");
    card.innerHTML = `<h4>${opt.title}</h4><p>${opt.desc}</p>`;
    card.onclick = () => { state.siteStructure = opt.id; renderFeatureStep(); };
    grid.appendChild(card);
  });

  return grid;
}

function buildCheckGrid(list) {
  const grid = document.createElement("div");
  grid.className = "check-grid";
  list.forEach(f => {
    const isCore = f.id === "about" || f.id === "contact";
    const label = document.createElement("label");
    label.className = "check-card" + (state.features.has(f.id) ? " checked" : "");
    label.innerHTML = `<input type="checkbox" ${state.features.has(f.id) ? "checked" : ""} ${isCore ? "disabled" : ""}> ${f.label}${isCore ? " (always on)" : ""}`;
    const input = label.querySelector("input");
    input.addEventListener("change", () => {
      if (input.checked) state.features.add(f.id); else state.features.delete(f.id);
      label.classList.toggle("checked", input.checked);
    });
    grid.appendChild(label);
  });
  return grid;
}

/* =========================
STEP 4 — RECOMMENDATION ENGINE
========================= */
function computeRecommendations() {
  const themes = CATEGORY_THEME_SETS[state.category] || CATEGORY_THEME_SETS.education;
  const cat = getCategory(state.category);
  const featureCount = state.features.size;

  return themes.map((t, i) => {
    const pages = ["Home"];
    if (state.features.has("about")) pages.push("About");
    if (state.features.has("gallery")) pages.push("Gallery");
    pages.push(cat.label + " Info");
    if (state.features.has("pricing")) pages.push("Pricing");
    if (state.features.has("blog")) pages.push("Blog");
    if (state.features.has("downloads")) pages.push("Downloads");
    if (state.features.has("faq")) pages.push("FAQ");
    pages.push("Contact");

    // Pick one layout per section that has variants, cycling by recommendation
    // index — this is what makes the 3 options structurally different, not
    // just differently colored.
    const layoutPicks = {};
    const layoutSummary = [];
    Object.entries(SECTION_LAYOUTS).forEach(([sectionId, variants]) => {
      if (!variants.length || !state.features.has(sectionId)) return;
      const pick = variants[i % variants.length];
      layoutPicks[sectionId] = pick.id;
      layoutSummary.push(`${sectionId}: ${pick.name}`);
    });

    const components = COMPONENTS.filter(c => {
      if (c.appliesTo === "global") return true;
      if (c.id === "whatsapp_btn") return state.features.has("whatsapp");
      if (c.id === "gallery_lightbox") return state.features.has("gallery") && layoutPicks.gallery !== "carousel";
      return state.features.has(c.appliesTo);
    }).map(c => c.id);

    return {
      themeKey: t.key,
      name: t.name,
      pages,
      layoutPicks,
      layoutSummary,
      components,
      sectionCount: featureCount + 2
    };
  });
}

function renderRecommendations() {
  const recs = computeRecommendations();
  const grid = document.getElementById("recGrid");
  grid.innerHTML = "";

  recs.forEach(rec => {
    const card = document.createElement("div");
    card.className = "rec-card" + (state.theme === rec.themeKey ? " selected" : "");
    card.innerHTML = `
      <div class="rec-preview mockwin theme-${rec.themeKey}">
        <div class="mockwin-bar"><span></span><span></span><span></span></div>
        <div class="mockwin-body">
          <div class="block" style="height:36%"></div>
          <div class="block" style="height:12%;width:60%"></div>
          <div class="mockwin-label">${state.content.businessName || "Your business"}<small>${rec.pages.length} pages</small></div>
        </div>
      </div>
      <div class="rec-info">
        <h4>${rec.name}</h4>
        <p>${rec.pages.join(" · ")}</p>
        ${rec.layoutSummary.length ? `<p style="margin-top:6px;font-family:var(--mono);font-size:11.5px;color:var(--indigo)">${rec.layoutSummary.join(" · ")}</p>` : ""}
      </div>
    `;
    card.onclick = () => {
      state.theme = rec.themeKey;
      state.themeName = rec.name;
      state.pages = rec.pages;
      state.sectionLayouts = rec.layoutPicks;
      state.components = rec.components;
      renderRecommendations();
    };
    grid.appendChild(card);
  });
}

/* =========================
STEP 5 — CONTENT FORM (dynamic)
========================= */
function renderContentForm() {
  const wrap = document.getElementById("contentWrap");
  wrap.innerHTML = "";

  wrap.appendChild(section("Business basics", "This appears across your whole site.", `
    <div class="form-row"><label>Business name</label><input id="f_businessName" value="${esc(state.content.businessName)}"></div>
    <div class="two-col">
      <div class="form-row"><label>Phone</label><input id="f_phone" value="${esc(state.content.phone)}"></div>
      <div class="form-row"><label>Email</label><input id="f_email" value="${esc(state.content.email)}"></div>
    </div>
    <div class="form-row"><label>Logo</label><input type="file" id="f_logo" accept="image/*"></div>
  `));

  if (state.features.has("about")) {
    wrap.appendChild(section("About Us", "A short introduction to your business.", `
      <div class="form-row"><label>About text</label><textarea id="f_about">${esc(state.content.about)}</textarea></div>
    `));
  }

  if (state.features.has("gallery")) {
    wrap.appendChild(repeaterSection("gallery", "Gallery", "Add photos that show your business at its best.",
      [{ key: "caption", label: "Caption", type: "text" }, { key: "file", label: "Image", type: "file" }]));
  }

  if (state.features.has("testimonials")) {
    wrap.appendChild(repeaterSection("testimonials", "Testimonials", "What your customers say about you.",
      [{ key: "name", label: "Customer name", type: "text" }, { key: "quote", label: "Quote", type: "textarea" }]));
  }

  if (state.features.has("team")) {
    wrap.appendChild(repeaterSection("team", "Team", "Introduce the people behind the business.",
      [{ key: "name", label: "Name", type: "text" }, { key: "role", label: "Role", type: "text" }]));
  }

  if (state.features.has("faq")) {
    wrap.appendChild(repeaterSection("faqs", "FAQ", "Answer the questions customers ask most.",
      [{ key: "question", label: "Question", type: "text" }, { key: "answer", label: "Answer", type: "textarea" }]));
  }

  if (state.features.has("pricing")) {
    wrap.appendChild(repeaterSection("pricing", "Pricing", "List your plans or price ranges.",
      [{ key: "name", label: "Plan name", type: "text" }, { key: "amount", label: "Price", type: "text" }, { key: "details", label: "What's included", type: "textarea" }]));
  }

  if (state.features.has("blog")) {
    wrap.appendChild(repeaterSection("blogPosts", "Blog", "Share updates and news.",
      [{ key: "title", label: "Title", type: "text" }, { key: "body", label: "Post", type: "textarea" }]));
  }

  if (state.features.has("downloads")) {
    wrap.appendChild(repeaterSection("downloads", "Downloads", "Brochures, price lists, or forms visitors can download.",
      [{ key: "label", label: "File label", type: "text" }, { key: "file", label: "File", type: "file" }]));
  }

  if (getCategory(state.category)) {
    const specific = getCategory(state.category).specificFeatures.filter(f => state.features.has(f.id));
    if (specific.length) {
      wrap.appendChild(section(`${getCategory(state.category).label} details`, "Specific to your type of business.",
        specific.map(f => `<div class="form-row"><label>${f.label}</label><textarea id="spec_${f.id}">${esc(state.content[f.id] || "")}</textarea></div>`).join("")));
    }
  }

  if (state.features.has("social")) {
    wrap.appendChild(section("Social media", "Link your existing profiles.", `
      <div class="two-col">
        <div class="form-row"><label>Facebook</label><input id="f_facebook" value="${esc(state.content.social.facebook)}"></div>
        <div class="form-row"><label>Instagram</label><input id="f_instagram" value="${esc(state.content.social.instagram)}"></div>
      </div>
      <div class="form-row"><label>Twitter / X</label><input id="f_twitter" value="${esc(state.content.social.twitter)}"></div>
    `));
  }

  if (state.features.has("whatsapp")) {
    wrap.appendChild(section("WhatsApp Chat", "Visitors can message you directly.", `
      <div class="form-row"><label>WhatsApp number (with country code)</label><input id="f_whatsapp" value="${esc(state.content.social.whatsappNumber)}" placeholder="2348012345678"></div>
    `));
  }

  if (state.features.has("maps")) {
    wrap.appendChild(section("Google Maps", "Paste your Google Maps embed link.", `
      <div class="form-row"><label>Maps embed URL</label><input id="f_maps" value="${esc(state.content.mapsEmbed)}" placeholder="https://maps.google.com/..."></div>
    `));
  }

  renderAllRepeaters();
}

function section(title, hint, bodyHtml) {
  const div = document.createElement("div");
  div.className = "form-section";
  div.innerHTML = `<h3>${title}</h3><p class="hint">${hint}</p>${bodyHtml}`;
  return div;
}

function repeaterSection(key, title, hint, fields) {
  const div = document.createElement("div");
  div.className = "form-section";
  div.dataset.repeater = key;
  div.innerHTML = `<h3>${title}</h3><p class="hint">${hint}</p><div class="repeater-items" id="rep_${key}"></div><button type="button" class="repeater-add" onclick="addRepeaterItem('${key}')">+ Add ${title.toLowerCase()} item</button>`;
  div.dataset.fields = JSON.stringify(fields);
  return div;
}

function esc(s) { return (s || "").toString().replace(/"/g, "&quot;"); }

function renderAllRepeaters() {
  document.querySelectorAll("[data-repeater]").forEach(sec => {
    const key = sec.dataset.repeater;
    const fields = JSON.parse(sec.dataset.fields);
    if (!state.content[key].length) state.content[key].push(emptyItem(fields));
    renderRepeaterItems(key, fields);
  });
}

function emptyItem(fields) {
  const item = { _id: uid() };
  fields.forEach(f => item[f.key] = "");
  return item;
}

function renderRepeaterItems(key, fields) {
  const wrap = document.getElementById(`rep_${key}`);
  wrap.innerHTML = "";
  state.content[key].forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "repeater-item";
    row.innerHTML = fields.map(f => {
      if (f.type === "textarea") {
        return `<div class="form-row"><label>${f.label}</label><textarea data-rk="${key}" data-idx="${idx}" data-field="${f.key}">${esc(item[f.key])}</textarea></div>`;
      }
      if (f.type === "file") {
        return `<div class="form-row"><label>${f.label}</label><input type="file" data-rk="${key}" data-idx="${idx}" data-field="${f.key}" accept="image/*,.pdf"></div>`;
      }
      return `<div class="form-row"><label>${f.label}</label><input data-rk="${key}" data-idx="${idx}" data-field="${f.key}" value="${esc(item[f.key])}"></div>`;
    }).join("") + (state.content[key].length > 1 ? `<button type="button" class="repeater-remove" onclick="removeRepeaterItem('${key}', ${idx})">Remove</button>` : "");
    wrap.appendChild(row);
  });
}

function addRepeaterItem(key) {
  const sec = document.querySelector(`[data-repeater="${key}"]`);
  const fields = JSON.parse(sec.dataset.fields);
  state.content[key].push(emptyItem(fields));
  renderRepeaterItems(key, fields);
}

function removeRepeaterItem(key, idx) {
  state.content[key].splice(idx, 1);
  const sec = document.querySelector(`[data-repeater="${key}"]`);
  renderRepeaterItems(key, JSON.parse(sec.dataset.fields));
}

function syncContentFromForm() {
  const val = id => document.getElementById(id)?.value ?? "";

  state.content.businessName = val("f_businessName");
  state.content.phone = val("f_phone");
  state.content.email = val("f_email");
  if (document.getElementById("f_about")) state.content.about = val("f_about");
  state.content.social.facebook = val("f_facebook");
  state.content.social.instagram = val("f_instagram");
  state.content.social.twitter = val("f_twitter");
  state.content.social.whatsappNumber = val("f_whatsapp");
  state.content.mapsEmbed = val("f_maps");

  document.querySelectorAll("[id^='spec_']").forEach(el => {
    state.content[el.id.replace("spec_", "")] = el.value;
  });

  document.querySelectorAll("[data-rk]").forEach(el => {
    if (el.type === "file") return; // files handled at submit time
    const key = el.dataset.rk, idx = el.dataset.idx, field = el.dataset.field;
    if (state.content[key][idx]) state.content[key][idx][field] = el.value;
  });

  state._logoFileEl = document.getElementById("f_logo");
}

/* =========================
STEP 6 — REVIEW & LAUNCH
========================= */
function renderReview() {
  const cat = getCategory(state.category);
  const wrap = document.getElementById("reviewWrap");
  const themeName = state.themeName || "";
  wrap.innerHTML = `
    <div class="review-summary">
      <div class="review-row"><span>Business</span><span>${esc(state.content.businessName)}</span></div>
      <div class="review-row"><span>Category</span><span>${cat.label} · ${esc(state.subcategory)}</span></div>
      <div class="review-row"><span>Design</span><span>${themeName}</span></div>
      <div class="review-row"><span>Sections</span><span>${state.features.size}</span></div>
      <div class="review-row"><span>Structure</span><span>${state.siteStructure === "multi" ? "Multiple pages" : "Single page"}</span></div>
      <div class="review-row"><span>Pages</span><span>${(state.pages || []).join(", ")}</span></div>
      <div class="review-row"><span>Trial</span><span>7 days free, starting today</span></div>
    </div>
  `;
}

async function uploadIfPresent(fileEl) {
  if (!fileEl || !fileEl.files || !fileEl.files[0]) return null;
  try {
    const res = await storage.createFile(BUCKET_UPLOADS, ID.unique(), fileEl.files[0]);
    return res.$id;
  } catch (err) {
    console.warn("Upload failed:", err.message);
    return null;
  }
}

async function launchWebsite() {
  const btn = document.getElementById("launchBtn");
  btn.disabled = true;
  btn.textContent = "Creating your website…";

  try {
    currentUser = currentUser || await requireAuth();
    if (!currentUser) return;

    if (state._logoFileEl) {
      const fileId = await uploadIfPresent(state._logoFileEl);
      if (fileId) state.content.logoFileId = fileId;
    }

    // Upload any repeater file fields
    for (const el of document.querySelectorAll("[data-rk][type=file]")) {
      const fileId = await uploadIfPresent(el);
      if (fileId) {
        const key = el.dataset.rk, idx = el.dataset.idx, field = el.dataset.field;
        state.content[key][idx][field + "FileId"] = fileId;
      }
    }

    const projectPayload = {
      userId: currentUser.$id,
      businessName: state.content.businessName,
      category: getCategory(state.category).label,
      subcategory: state.subcategory,
      features: JSON.stringify(Array.from(state.features)),
      theme: state.theme,
      themeName: state.themeName,
      pages: JSON.stringify(state.pages || []),
      siteStructure: state.siteStructure,
      sectionLayouts: JSON.stringify(state.sectionLayouts || {}),
      components: JSON.stringify(state.components || [])
    };

    let projectId = state.projectId;

    if (projectId) {
      await databases.updateDocument(DB_ID, COL_PROJECTS, projectId, projectPayload);
    } else {
      const proj = await databases.createDocument(DB_ID, COL_PROJECTS, ID.unique(), projectPayload);
      projectId = proj.$id;
    }

    const contentPayload = { projectId, data: JSON.stringify(state.content) };

    try {
      await databases.getDocument(DB_ID, COL_CONTENT, projectId);
      await databases.updateDocument(DB_ID, COL_CONTENT, projectId, contentPayload);
    } catch {
      await databases.createDocument(DB_ID, COL_CONTENT, projectId, contentPayload);
    }

    // Trial state lives server-side — this is idempotent and anchored to the
    // project's own $createdAt, so editing a project later can't reset it.
    await callSubscriptionManager("ensure_trial", { projectId });

    showToast("Website created! Starting your free trial.", "success");
    setTimeout(() => window.location.href = `preview.html?pid=${projectId}`, 1000);

  } catch (err) {
    console.error(err);
    showToast(err.message || "Could not create your website", "error");
    btn.disabled = false;
    btn.textContent = "Launch my website";
  }
}

/* =========================
INITIALIZATION / BOOTSTRAP
========================= */
async function initWizard() {
  currentUser = await requireAuth();
  if (!currentUser) return;

  await loadCatalog();

  const params = new URLSearchParams(window.location.search);
  const pid = params.get("pid");

  if (pid) {
    try {
      const proj = await databases.getDocument(DB_ID, COL_PROJECTS, pid);
      const content = await databases.getDocument(DB_ID, COL_CONTENT, pid);

      state.projectId = pid;
      state.category = CATEGORIES.find(c => c.label === proj.category)?.id || null;
      state.subcategory = proj.subcategory;
      state.theme = proj.theme;
      state.themeName = proj.themeName;
      state.pages = JSON.parse(proj.pages || "[]");
      state.siteStructure = proj.siteStructure || "single";
      state.sectionLayouts = JSON.parse(proj.sectionLayouts || "{}");
      state.components = JSON.parse(proj.components || "[]");
      state.features = new Set(JSON.parse(proj.features || "[]"));
      state.content = { ...state.content, ...JSON.parse(content.data || "{}") };
    } catch (err) {
      console.warn("Could not load existing project, starting fresh:", err.message);
    }
  }

  renderCategoryStep();
  goToStep(1);
}

initWizard();
