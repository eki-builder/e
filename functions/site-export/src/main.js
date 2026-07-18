/* =========================
FILE OVERVIEW
========================= */
// Appwrite Function: site_export
//
// Renders a project's stored content into a static site — one index.html
// if the project's siteStructure is "single", or index.html plus one file
// per page (about.html, gallery.html, etc.) if "multi" — and pushes it to
// a dedicated GitHub repo for that project, enabling GitHub Pages so it's
// live immediately.
//
// Called via functions.createExecution() with { projectId }. Requires the
// caller to own the project and to have an active trial/subscription.
//
// Needs two Function Variables (see README-APPWRITE.md):
//   GITHUB_TOKEN  — a GitHub personal access token with `repo` scope
//   GITHUB_OWNER  — the GitHub username/org repos are created under
//
// Scope: images and downloads keep linking to Appwrite Storage rather than
// being mirrored into the repo — see README-APPWRITE.md for why, and what
// asset-mirroring would need on top of this. Rendering logic (sections,
// layouts, components) is ported from js/preview.js — keep the two in sync.

import { Client, Databases } from 'node-appwrite';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STYLE_CSS = readFileSync(join(__dirname, 'style.css'), 'utf-8');

const DB_ID             = process.env.EKI_DB_ID;
const COL_PROJECTS      = 'projects';
const COL_CONTENT       = 'website_content';
const COL_SUBSCRIPTIONS = 'subscriptions';
const BUCKET_UPLOADS    = 'uploads';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER  = process.env.GITHUB_OWNER;
const GITHUB_API    = 'https://api.github.com';

// page key -> output filename
const PAGE_FILES = {
  home: 'index.html', about: 'about.html', gallery: 'gallery.html',
  info: 'info.html', pricing: 'pricing.html', blog: 'blog.html',
  downloads: 'downloads.html', faq: 'faq.html', contact: 'contact.html'
};

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key'] ?? '');

  const databases = new Databases(client);

  const userId = req.headers['x-appwrite-user-id'];
  if (!userId) {
    return res.json({ ok: false, message: 'You must be logged in.' }, 401);
  }

  if (!DB_ID || !GITHUB_TOKEN || !GITHUB_OWNER) {
    error('Missing EKI_DB_ID, GITHUB_TOKEN, or GITHUB_OWNER function variable');
    return res.json({ ok: false, message: 'Publishing is not configured yet.' }, 500);
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return res.json({ ok: false, message: 'Invalid request body.' }, 400);
  }

  const { projectId } = body;
  if (!projectId) {
    return res.json({ ok: false, message: 'Missing projectId.' }, 400);
  }

  let project, contentDoc, sub;
  try {
    project = await databases.getDocument(DB_ID, COL_PROJECTS, projectId);
  } catch {
    return res.json({ ok: false, message: 'Website not found.' }, 404);
  }

  if (project.userId !== userId) {
    return res.json({ ok: false, message: 'You do not have access to this website.' }, 403);
  }

  try {
    contentDoc = await databases.getDocument(DB_ID, COL_CONTENT, projectId);
  } catch {
    return res.json({ ok: false, message: 'This website has no content yet.' }, 400);
  }

  try {
    sub = await databases.getDocument(DB_ID, COL_SUBSCRIPTIONS, projectId);
  } catch {
    sub = null;
  }

  const now = new Date();
  const inTrial = sub?.status === 'trial' && sub.trialEndsAt && new Date(sub.trialEndsAt) > now;
  const active = sub?.status === 'active' && sub.expiresAt && new Date(sub.expiresAt) > now;
  if (!inTrial && !active) {
    return res.json({ ok: false, message: 'This website is inactive. Activate a subscription PIN before publishing.' }, 400);
  }

  try {
    const content = JSON.parse(contentDoc.data || '{}');
    content._components = JSON.parse(project.components || '[]');
    const layouts = JSON.parse(project.sectionLayouts || '{}');
    const isMulti = project.siteStructure === 'multi';
    project._multi = isMulti;

    const repo = slugify(project.businessName) + '-' + projectId.slice(0, 8);
    await ensureRepo(repo, project.businessName, log);

    const pageKeys = isMulti ? activePageKeys(project) : ['home'];
    for (const pageKey of pageKeys) {
      const html = wrapDocument(project, buildPage(project, content, layouts, pageKey, isMulti), pageKey === 'home' ? 'index' : pageKey);
      await putFile(repo, PAGE_FILES[pageKey], html);
    }
    await putFile(repo, 'style.css', STYLE_CSS);
    await ensurePages(repo, log);

    const publishedUrl = `https://${GITHUB_OWNER}.github.io/${repo}/`;
    const repoUrl = `https://github.com/${GITHUB_OWNER}/${repo}`;

    await databases.updateDocument(DB_ID, COL_PROJECTS, projectId, { publishedUrl, repoUrl });

    log(`Published project ${projectId} to ${repoUrl} (${pageKeys.length} page(s))`);

    return res.json({ ok: true, publishedUrl, repoUrl });

  } catch (err) {
    error(err.message);
    return res.json({ ok: false, message: err.message || 'Publishing failed.' }, 500);
  }
};

/* =========================
GITHUB HELPERS
========================= */
function ghHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };
}

async function ensureRepo(repo, businessName, log) {
  const check = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${repo}`, { headers: ghHeaders() });
  if (check.ok) return;

  log(`Creating GitHub repo ${GITHUB_OWNER}/${repo}`);
  const createRes = await fetch(`${GITHUB_API}/user/repos`, {
    method: 'POST',
    headers: ghHeaders(),
    body: JSON.stringify({
      name: repo,
      description: `Generated by Eki for ${businessName}`,
      auto_init: true,
      private: false
    })
  });

  if (!createRes.ok) {
    const detail = await createRes.text();
    throw new Error(`Could not create GitHub repo: ${detail}`);
  }

  // Give GitHub a moment to finish provisioning the default branch before
  // we try to write files to it.
  await new Promise(r => setTimeout(r, 1500));
}

async function putFile(repo, path, contentStr) {
  const url = `${GITHUB_API}/repos/${GITHUB_OWNER}/${repo}/contents/${path}`;

  let sha;
  const existing = await fetch(url, { headers: ghHeaders() });
  if (existing.ok) {
    const json = await existing.json();
    sha = json.sha;
  }

  const putRes = await fetch(url, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify({
      message: sha ? `Update ${path}` : `Add ${path}`,
      content: Buffer.from(contentStr, 'utf-8').toString('base64'),
      branch: 'main',
      ...(sha ? { sha } : {})
    })
  });

  if (!putRes.ok) {
    const detail = await putRes.text();
    throw new Error(`Could not write ${path} to GitHub: ${detail}`);
  }
}

async function ensurePages(repo, log) {
  const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${repo}/pages`, {
    method: 'POST',
    headers: ghHeaders(),
    body: JSON.stringify({ build_type: 'legacy', source: { branch: 'main', path: '/' } })
  });

  // 409 = Pages already enabled for this repo — that's fine, not an error.
  if (!res.ok && res.status !== 409) {
    log(`Note: could not enable GitHub Pages automatically (${res.status}). It may need to be turned on manually in the repo's Settings → Pages.`);
  }
}

function slugify(str) {
  return (str || 'site')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'site';
}

/* =========================
SITE RENDERING (ported from js/preview.js — keep the two in sync)
========================= */
function fileUrl(fileId) {
  if (!fileId) return null;
  return `${process.env.APPWRITE_FUNCTION_API_ENDPOINT}/storage/buckets/${BUCKET_UPLOADS}/files/${fileId}/view?project=${process.env.APPWRITE_FUNCTION_PROJECT_ID}`;
}

function esc(s) { return (s || '').toString().replace(/</g, '&lt;'); }

const SPECIFIC_FIELD_KEYS = ["admissions","calendar","fees","staff","sermons","servicetimes","giving","events","appointments","doctors","insurance","emergency","booking","rates","reservation","amenities","casestudies","consultation","portal","certs","listings","plotsizes","paymentplans","sitevisit","productfeatures","docs","demo","integrations","programs","donate","volunteer","impact"];

function activePageKeys(project) {
  const features = JSON.parse(project.features || '[]');
  const has = f => features.includes(f);
  const keys = ['home'];
  if (has('about')) keys.push('about');
  if (has('gallery')) keys.push('gallery');
  keys.push('info');
  if (has('pricing')) keys.push('pricing');
  if (has('blog')) keys.push('blog');
  if (has('downloads')) keys.push('downloads');
  if (has('faq')) keys.push('faq');
  keys.push('contact');
  return keys;
}

function heroBlock(project, isMulti) {
  return `<div class="site-hero">
    <h1>${esc(project.businessName)}</h1>
    <p>${esc(project.category)} · ${esc(project.subcategory)}</p>
    <a class="btn" href="${isMulti ? 'contact.html' : '#contact'}">Get in touch</a>
  </div>`;
}

function aboutBlock(content) {
  if (!content.about) return '';
  return `<div class="site-section" id="about"><span class="eyebrow">About</span><h2>Who we are</h2><p style="max-width:640px;color:var(--site-muted)">${esc(content.about)}</p></div>`;
}

function galleryBlock(content, layout) {
  if (!content.gallery?.length) return '';
  const useLightbox = content._components?.includes('gallery_lightbox') && layout !== 'carousel';

  if (layout === 'carousel') {
    let html = `<div class="site-section" id="gallery"><span class="eyebrow">Gallery</span><h2>See us in action</h2><div class="gallery-carousel">`;
    content.gallery.forEach(g => {
      const src = fileUrl(g.fileFileId);
      html += `<div class="gallery-carousel-item">${src ? `<img src="${src}">` : ''}${g.caption ? `<span>${esc(g.caption)}</span>` : ''}</div>`;
    });
    return html + `</div></div>`;
  }

  let html = `<div class="site-section" id="gallery"><span class="eyebrow">Gallery</span><h2>See us in action</h2><div class="gallery-grid">`;
  content.gallery.forEach(g => {
    const src = fileUrl(g.fileFileId);
    const img = src ? `<img src="${src}">` : '';
    const inner = useLightbox && src ? `<a href="${src}" target="_blank">${img}</a>` : img;
    html += `<div class="gallery-item">${inner}${g.caption ? `<span>${esc(g.caption)}</span>` : ''}</div>`;
  });
  return html + `</div></div>`;
}

function specificBlock(project, content) {
  const entries = Object.entries(content).filter(([k, v]) => typeof v === 'string' && v && SPECIFIC_FIELD_KEYS.includes(k));
  if (!entries.length) return '';
  let html = `<div class="site-section" id="info"><span class="eyebrow">${esc(project.category)}</span><h2>Details</h2><div class="site-grid">`;
  entries.forEach(([k, v]) => { html += `<div class="site-card"><h3>${k.replace(/([A-Z])/g, ' $1')}</h3><p>${esc(v)}</p></div>`; });
  return html + `</div></div>`;
}

function teamBlock(content) {
  if (!content.team?.length) return '';
  let html = `<div class="site-section" id="team"><span class="eyebrow">Team</span><h2>Meet the team</h2><div class="site-grid">`;
  content.team.forEach(t => { if (t.name) html += `<div class="site-card"><h3>${esc(t.name)}</h3><p>${esc(t.role)}</p></div>`; });
  return html + `</div></div>`;
}

function pricingBlock(content) {
  if (!content.pricing?.length) return '';
  let html = `<div class="site-section" id="pricing"><span class="eyebrow">Pricing</span><h2>Plans</h2><div class="pricing-row">`;
  content.pricing.forEach(p => { if (p.name) html += `<div class="pricing-col"><h3>${esc(p.name)}</h3><p class="amt">${esc(p.amount)}</p><p>${esc(p.details)}</p></div>`; });
  return html + `</div></div>`;
}

function testimonialsBlock(content, layout) {
  if (!content.testimonials?.length) return '';
  if (layout === 'quote') {
    let html = `<div class="site-section" id="testimonials"><span class="eyebrow">Testimonials</span><h2>What people say</h2><div class="quote-stack">`;
    content.testimonials.forEach(t => { if (t.quote) html += `<blockquote>"${esc(t.quote)}"<cite>${esc(t.name)}</cite></blockquote>`; });
    return html + `</div></div>`;
  }
  let html = `<div class="site-section" id="testimonials"><span class="eyebrow">Testimonials</span><h2>What people say</h2><div class="site-grid">`;
  content.testimonials.forEach(t => { if (t.quote) html += `<div class="site-card"><p>"${esc(t.quote)}"</p><h3 style="margin-top:10px">${esc(t.name)}</h3></div>`; });
  return html + `</div></div>`;
}

function blogBlock(content) {
  if (!content.blogPosts?.length) return '';
  let html = `<div class="site-section" id="blog"><span class="eyebrow">Blog</span><h2>Latest updates</h2><div class="site-grid">`;
  content.blogPosts.forEach(b => { if (b.title) html += `<div class="site-card"><h3>${esc(b.title)}</h3><p>${esc(b.body)}</p></div>`; });
  return html + `</div></div>`;
}

function downloadsBlock(content) {
  if (!content.downloads?.length) return '';
  let html = `<div class="site-section" id="downloads"><span class="eyebrow">Downloads</span><h2>Resources</h2><div class="site-grid">`;
  content.downloads.forEach(d => {
    const src = fileUrl(d.fileFileId);
    if (d.label) html += `<div class="site-card"><h3>${esc(d.label)}</h3>${src ? `<a href="${src}" target="_blank">Download</a>` : '<p>No file uploaded</p>'}</div>`;
  });
  return html + `</div></div>`;
}

function faqBlock(content, layout) {
  if (!content.faqs?.length) return '';
  if (layout === 'accordion') {
    let html = `<div class="site-section" id="faq"><span class="eyebrow">FAQ</span><h2>Common questions</h2>`;
    content.faqs.forEach(f => { if (f.question) html += `<details class="faq-accordion-item"><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`; });
    return html + `</div>`;
  }
  let html = `<div class="site-section" id="faq"><span class="eyebrow">FAQ</span><h2>Common questions</h2>`;
  content.faqs.forEach(f => { if (f.question) html += `<div class="faq-row"><h4>${esc(f.question)}</h4><p>${esc(f.answer)}</p></div>`; });
  return html + `</div>`;
}

function mapBlock(content) {
  if (!content.mapsEmbed) return '';
  return `<div class="site-section" id="map"><span class="eyebrow">Find us</span><h2>Location</h2><iframe src="${content.mapsEmbed}" style="width:100%;height:320px;border:0;border-radius:16px" loading="lazy"></iframe></div>`;
}

function contactBlock(content, features) {
  const has = f => features.includes(f);
  let html = `<div class="site-footer" id="contact">
    <h2 style="font-family:'Space Grotesk',sans-serif;font-size:22px;margin-bottom:14px;">Get in touch</h2>
    <p>${esc(content.phone)} ${content.phone && content.email ? '·' : ''} ${esc(content.email)}</p>
    ${has('social') ? `<div class="socials" style="margin-top:16px">
      ${content.social?.facebook ? `<a href="${content.social.facebook}" target="_blank">Facebook</a>` : ''}
      ${content.social?.instagram ? `<a href="${content.social.instagram}" target="_blank">Instagram</a>` : ''}
      ${content.social?.twitter ? `<a href="${content.social.twitter}" target="_blank">Twitter/X</a>` : ''}
    </div>` : ''}
    <p style="margin-top:18px;opacity:0.6;font-size:12px">Built with Eki</p>
  </div>`;

  if (has('whatsapp') && content.social?.whatsappNumber) {
    html += `<a class="wa-float" href="https://wa.me/${content.social.whatsappNumber.replace(/\D/g, '')}" target="_blank" title="Chat on WhatsApp">💬</a>`;
  }
  return html;
}

function navBlock(project, content, isMulti, currentPage) {
  const features = JSON.parse(project.features || '[]');
  const has = f => features.includes(f);
  const logoSrc = fileUrl(content.logoFileId);
  const link = (page, label) => isMulti
    ? `<a href="${PAGE_FILES[page]}"${page === currentPage ? ' style="opacity:0.5"' : ''}>${label}</a>`
    : `<a href="#${page}">${label}</a>`;

  const sticky = content._components?.includes('sticky_nav') ? ' sticky' : '';

  return `<div class="site-nav${sticky}">
    <div class="site-logo">${logoSrc ? `<img src="${logoSrc}" alt="">` : ''}${esc(project.businessName)}</div>
    <div class="site-nav-links">
      ${isMulti ? link('home', 'Home') : ''}
      ${has('about') ? link('about', 'About') : ''}
      ${has('gallery') ? link('gallery', 'Gallery') : ''}
      ${has('pricing') ? link('pricing', 'Pricing') : ''}
      ${has('faq') ? link('faq', 'FAQ') : ''}
      ${link('contact', 'Contact')}
    </div>
  </div>`;
}

function buildPage(project, content, layouts, pageKey, isMulti) {
  const features = JSON.parse(project.features || '[]');
  let html = navBlock(project, content, isMulti, pageKey);

  if (!isMulti) {
    html += heroBlock(project, false);
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

  switch (pageKey) {
    case 'home':
      html += heroBlock(project, true);
      html += testimonialsBlock(content, layouts.testimonials);
      html += teamBlock(content);
      break;
    case 'about':
      html += aboutBlock(content) || `<div class="site-section"><p style="color:var(--site-muted)">Nothing here yet.</p></div>`;
      break;
    case 'gallery':
      html += galleryBlock(content, layouts.gallery);
      break;
    case 'info':
      html += specificBlock(project, content);
      break;
    case 'pricing':
      html += pricingBlock(content);
      break;
    case 'blog':
      html += blogBlock(content);
      break;
    case 'downloads':
      html += downloadsBlock(content);
      break;
    case 'faq':
      html += faqBlock(content, layouts.faq);
      break;
    case 'contact':
      html += mapBlock(content);
      html += contactBlock(content, features);
      break;
  }
  return html;
}

function wrapDocument(project, bodyHtml, titleSuffix) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(project.businessName)}${titleSuffix !== 'index' ? ' — ' + titleSuffix : ''}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body data-theme="${project.theme || 'indigo'}">
${bodyHtml}
</body>
</html>`;
}
