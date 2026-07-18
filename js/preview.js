/* =========================
FILE OVERVIEW
========================= */
// Renders the "generated website" for a project entirely client-side,
// using the theme, section layouts, components, and content saved by the
// wizard. This is the live stand-in for the static export (site_export
// Function) — keep the two in sync when either changes.

function fileUrl(fileId) {
  if (!fileId) return null;
  try { return storage.getFileView(BUCKET_UPLOADS, fileId).href || storage.getFileView(BUCKET_UPLOADS, fileId); }
  catch { return null; }
}

function esc(s) { return (s || "").toString().replace(/</g, "&lt;"); }

function daysLeft(dateStr) {
  return Math.max(0, Math.ceil((new Date(dateStr) - new Date()) / 86400000));
}

const SPECIFIC_FIELD_KEYS = ["admissions","calendar","fees","staff","sermons","servicetimes","giving","events","appointments","doctors","insurance","emergency","booking","rates","reservation","amenities","casestudies","consultation","portal","certs","listings","plotsizes","paymentplans","sitevisit","productfeatures","docs","demo","integrations","programs","donate","volunteer","impact"];

/* =========================
SECTION BLOCKS — each returns an HTML string. Layout variants (from
state.sectionLayouts, saved by the wizard's recommendation step) switch
between the branches below.
========================= */
function heroBlock(project) {
  return `<div class="site-hero">
    <h1>${esc(project.businessName)}</h1>
    <p>${esc(project.category)} · ${esc(project.subcategory)}</p>
    <a class="btn" href="${project._multi ? "preview.html?pid=" + project.$id + "&page=contact" : "#contact"}">Get in touch</a>
  </div>`;
}

function aboutBlock(content) {
  if (!content.about) return "";
  return `<div class="site-section" id="about"><span class="eyebrow">About</span><h2>Who we are</h2><p style="max-width:640px;color:var(--site-muted)">${esc(content.about)}</p></div>`;
}

function galleryBlock(content, layout) {
  if (!content.gallery?.length) return "";
  const useLightbox = content._components?.includes("gallery_lightbox") && layout !== "carousel";

  if (layout === "carousel") {
    let html = `<div class="site-section" id="gallery"><span class="eyebrow">Gallery</span><h2>See us in action</h2><div class="gallery-carousel">`;
    content.gallery.forEach(g => {
      const src = fileUrl(g.fileFileId);
      html += `<div class="gallery-carousel-item">${src ? `<img src="${src}">` : ""}${g.caption ? `<span>${esc(g.caption)}</span>` : ""}</div>`;
    });
    return html + `</div></div>`;
  }

  let html = `<div class="site-section" id="gallery"><span class="eyebrow">Gallery</span><h2>See us in action</h2><div class="gallery-grid">`;
  content.gallery.forEach(g => {
    const src = fileUrl(g.fileFileId);
    const img = src ? `<img src="${src}">` : "";
    const inner = useLightbox && src ? `<a href="${src}" target="_blank">${img}</a>` : img;
    html += `<div class="gallery-item">${inner}${g.caption ? `<span>${esc(g.caption)}</span>` : ""}</div>`;
  });
  return html + `</div></div>`;
}

function specificBlock(project, content) {
  const entries = Object.entries(content).filter(([k, v]) => typeof v === "string" && v && SPECIFIC_FIELD_KEYS.includes(k));
  if (!entries.length) return "";
  let html = `<div class="site-section" id="info"><span class="eyebrow">${esc(project.category)}</span><h2>Details</h2><div class="site-grid">`;
  entries.forEach(([k, v]) => { html += `<div class="site-card"><h3>${k.replace(/([A-Z])/g, " $1")}</h3><p>${esc(v)}</p></div>`; });
  return html + `</div></div>`;
}

function teamBlock(content) {
  if (!content.team?.length) return "";
  let html = `<div class="site-section" id="team"><span class="eyebrow">Team</span><h2>Meet the team</h2><div class="site-grid">`;
  content.team.forEach(t => { if (t.name) html += `<div class="site-card"><h3>${esc(t.name)}</h3><p>${esc(t.role)}</p></div>`; });
  return html + `</div></div>`;
}

function pricingBlock(content) {
  if (!content.pricing?.length) return "";
  let html = `<div class="site-section" id="pricing"><span class="eyebrow">Pricing</span><h2>Plans</h2><div class="pricing-row">`;
  content.pricing.forEach(p => { if (p.name) html += `<div class="pricing-col"><h3>${esc(p.name)}</h3><p class="amt">${esc(p.amount)}</p><p>${esc(p.details)}</p></div>`; });
  return html + `</div></div>`;
}

function testimonialsBlock(content, layout) {
  if (!content.testimonials?.length) return "";
  if (layout === "quote") {
    let html = `<div class="site-section" id="testimonials"><span class="eyebrow">Testimonials</span><h2>What people say</h2><div class="quote-stack">`;
    content.testimonials.forEach(t => { if (t.quote) html += `<blockquote>"${esc(t.quote)}"<cite>${esc(t.name)}</cite></blockquote>`; });
    return html + `</div></div>`;
  }
  let html = `<div class="site-section" id="testimonials"><span class="eyebrow">Testimonials</span><h2>What people say</h2><div class="site-grid">`;
  content.testimonials.forEach(t => { if (t.quote) html += `<div class="site-card"><p>"${esc(t.quote)}"</p><h3 style="margin-top:10px">${esc(t.name)}</h3></div>`; });
  return html + `</div></div>`;
}

function blogBlock(content) {
  if (!content.blogPosts?.length) return "";
  let html = `<div class="site-section" id="blog"><span class="eyebrow">Blog</span><h2>Latest updates</h2><div class="site-grid">`;
  content.blogPosts.forEach(b => { if (b.title) html += `<div class="site-card"><h3>${esc(b.title)}</h3><p>${esc(b.body)}</p></div>`; });
  return html + `</div></div>`;
}

function downloadsBlock(content) {
  if (!content.downloads?.length) return "";
  let html = `<div class="site-section" id="downloads"><span class="eyebrow">Downloads</span><h2>Resources</h2><div class="site-grid">`;
  content.downloads.forEach(d => {
    const src = fileUrl(d.fileFileId);
    if (d.label) html += `<div class="site-card"><h3>${esc(d.label)}</h3>${src ? `<a href="${src}" target="_blank">Download</a>` : "<p>No file uploaded</p>"}</div>`;
  });
  return html + `</div></div>`;
}

function faqBlock(content, layout) {
  if (!content.faqs?.length) return "";
  if (layout === "accordion") {
    let html = `<div class="site-section" id="faq"><span class="eyebrow">FAQ</span><h2>Common questions</h2>`;
    content.faqs.forEach(f => { if (f.question) html += `<details class="faq-accordion-item"><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`; });
    return html + `</div>`;
  }
  let html = `<div class="site-section" id="faq"><span class="eyebrow">FAQ</span><h2>Common questions</h2>`;
  content.faqs.forEach(f => { if (f.question) html += `<div class="faq-row"><h4>${esc(f.question)}</h4><p>${esc(f.answer)}</p></div>`; });
  return html + `</div>`;
}

function mapBlock(content) {
  if (!content.mapsEmbed) return "";
  return `<div class="site-section" id="map"><span class="eyebrow">Find us</span><h2>Location</h2><iframe src="${content.mapsEmbed}" style="width:100%;height:320px;border:0;border-radius:16px" loading="lazy"></iframe></div>`;
}

function contactBlock(content, features) {
  const has = f => features.includes(f);
  let html = `<div class="site-footer" id="contact">
    <h2 style="font-family:'Space Grotesk',sans-serif;font-size:22px;margin-bottom:14px;">Get in touch</h2>
    <p>${esc(content.phone)} ${content.phone && content.email ? "·" : ""} ${esc(content.email)}</p>
    ${has("social") ? `<div class="socials" style="margin-top:16px">
      ${content.social?.facebook ? `<a href="${content.social.facebook}" target="_blank">Facebook</a>` : ""}
      ${content.social?.instagram ? `<a href="${content.social.instagram}" target="_blank">Instagram</a>` : ""}
      ${content.social?.twitter ? `<a href="${content.social.twitter}" target="_blank">Twitter/X</a>` : ""}
    </div>` : ""}
    <p style="margin-top:18px;opacity:0.6;font-size:12px">Built with Eki</p>
  </div>`;

  if (has("whatsapp") && content.social?.whatsappNumber) {
    html += `<a class="wa-float" href="https://wa.me/${content.social.whatsappNumber.replace(/\D/g, "")}" target="_blank" title="Chat on WhatsApp">💬</a>`;
  }
  return html;
}

/* =========================
NAV — link targets differ between single-page (anchors) and
multi-page (separate ?page= query values) modes.
========================= */
function navBlock(project, content, isMulti, currentPage) {
  const has = f => JSON.parse(project.features || "[]").includes(f);
  const logoSrc = fileUrl(content.logoFileId);
  const link = (page, label) => isMulti
    ? `<a href="preview.html?pid=${project.$id}&page=${page}"${page === currentPage ? ' style="opacity:0.5"' : ""}>${label}</a>`
    : `<a href="#${page}">${label}</a>`;

  const sticky = content._components?.includes("sticky_nav") ? " sticky" : "";

  return `<div class="site-nav${sticky}">
    <div class="site-logo">${logoSrc ? `<img src="${logoSrc}" alt="">` : ""}${esc(project.businessName)}</div>
    <div class="site-nav-links">
      ${isMulti ? link("home", "Home") : ""}
      ${has("about") ? link("about", "About") : ""}
      ${has("gallery") ? link("gallery", "Gallery") : ""}
      ${has("pricing") ? link("pricing", "Pricing") : ""}
      ${has("faq") ? link("faq", "FAQ") : ""}
      ${link("contact", "Contact")}
    </div>
  </div>`;
}

/* =========================
PAGE ASSEMBLY
========================= */
function buildPage(project, content, layouts, pageKey, isMulti) {
  const features = JSON.parse(project.features || "[]");
  const has = f => features.includes(f);
  let html = navBlock(project, content, isMulti, pageKey);

  if (!isMulti) {
    // Single page: everything, in canonical order.
    html += heroBlock(project);
    html += aboutBlock(content);
    html += galleryBlock(content, layouts.gallery);
    html += specificBlock(project, content);
    html += teamBlock(content);
    html += pricingBlock(content);
    html += testimonialsBlock(content, layouts.testimonials);
    html += blogBlock(content);
    html += downloadsBlock(content);
    html += faqBlock(content, layouts.faq);
    html += mapBlock(content);
    html += contactBlock(content, features);
    return html;
  }

  // Multi page: only the section(s) that belong to this page.
  switch (pageKey) {
    case "home":
      html += heroBlock(project);
      html += testimonialsBlock(content, layouts.testimonials);
      html += teamBlock(content);
      break;
    case "about":
      html += aboutBlock(content) || `<div class="site-section"><p style="color:var(--site-muted)">Nothing here yet.</p></div>`;
      break;
    case "gallery":
      html += galleryBlock(content, layouts.gallery);
      break;
    case "info":
      html += specificBlock(project, content);
      break;
    case "pricing":
      html += pricingBlock(content);
      break;
    case "blog":
      html += blogBlock(content);
      break;
    case "downloads":
      html += downloadsBlock(content);
      break;
    case "faq":
      html += faqBlock(content, layouts.faq);
      break;
    case "contact":
      html += mapBlock(content);
      html += contactBlock(content, features);
      break;
  }
  return html;
}

/* =========================
INIT
========================= */
async function loadPreview() {
  const params = new URLSearchParams(window.location.search);
  const pid = params.get("pid");
  const requestedPage = params.get("page") || "home";
  const root = document.getElementById("siteRoot");

  if (!pid) {
    root.innerHTML = `<div class="empty-notice"><h2>No website selected</h2><p>Go back to your dashboard and choose a project to preview.</p></div>`;
    return;
  }

  let project, contentDoc, sub;
  try {
    project = await databases.getDocument(DB_ID, COL_PROJECTS, pid);
    contentDoc = await databases.getDocument(DB_ID, COL_CONTENT, pid);
  } catch (err) {
    root.innerHTML = `<div class="empty-notice"><h2>Couldn't load this website</h2><p>${err.message}</p></div>`;
    return;
  }

  try {
    sub = await databases.getDocument(DB_ID, COL_SUBSCRIPTIONS, pid);
  } catch {
    sub = null;
  }

  const content = JSON.parse(contentDoc.data || "{}");
  content._components = JSON.parse(project.components || "[]");
  const layouts = JSON.parse(project.sectionLayouts || "{}");
  const isMulti = project.siteStructure === "multi";
  project._multi = isMulti;

  document.body.dataset.theme = project.theme || "indigo";
  document.title = `${project.businessName} — Preview`;

  let html = "";

  const now = new Date();
  const inTrial = sub?.status === "trial" && sub.trialEndsAt && new Date(sub.trialEndsAt) > now;
  const active = sub?.status === "active" && sub.expiresAt && new Date(sub.expiresAt) > now;
  if (inTrial) {
    html += `<div class="trial-strip">Free trial preview — ${daysLeft(sub.trialEndsAt)} day(s) left <a href="dashboard.html">Manage subscription</a></div>`;
  } else if (!active) {
    html += `<div class="trial-strip">This website is inactive — <a href="dashboard.html">activate a subscription PIN</a> to bring it back online</div>`;
  }

  html += buildPage(project, content, layouts, isMulti ? requestedPage : "home", isMulti);

  root.innerHTML = html;
}

loadPreview();
