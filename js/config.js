/* =========================
FILE OVERVIEW
========================= */
// Shared Appwrite configuration. Loaded before every other app script.
// Replace the placeholders below with your own Appwrite project values.
// See README-APPWRITE.md for the full collection/attribute schema to create.

/* =========================
EXTERNAL SERVICE SETUP
========================= */
const APPWRITE_ENDPOINT  = "https://YOUR_REGION.cloud.appwrite.io/v1"; // e.g. https://nyc.cloud.appwrite.io/v1
const APPWRITE_PROJECT   = "YOUR_PROJECT_ID";

const DB_ID       = "YOUR_DATABASE_ID";   // Appwrite Database ID
const COL_PROFILES      = "profiles";          // one doc per user: display name, theme pref
const COL_PROJECTS      = "projects";          // one doc per generated website (content/config only)
const COL_CONTENT       = "website_content";   // one doc per project: all form content (JSON)
const COL_SUBSCRIPTIONS = "subscriptions";     // one doc per project: trial/PIN state — client is READ-ONLY here
const COL_PINS          = "subscription_pins"; // PIN codes — client access limited to team:admins (see README-APPWRITE.md)
const COL_PLATFORM_CONFIG = "platform_config"; // one doc ("catalog"): categories/subcategories/features/themes — team:admins write, everyone read
const BUCKET_UPLOADS    = "uploads";           // Appwrite Storage bucket for logos/gallery/docs

const ADMIN_TEAM_ID = "admins"; // Appwrite Team ID — membership gates admin.html and platform_config/PIN writes

const FUNC_SUBSCRIPTION_MANAGER = "subscription_manager"; // Appwrite Function ID — see README-APPWRITE.md
const FUNC_SITE_EXPORT          = "site_export";           // Appwrite Function ID — pushes a generated site to GitHub

const client = new Appwrite.Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT);

const account   = new Appwrite.Account(client);
const databases = new Appwrite.Databases(client);
const storage   = new Appwrite.Storage(client);
const functions = new Appwrite.Functions(client);
const teams     = new Appwrite.Teams(client);
const Query     = Appwrite.Query;
const ID        = Appwrite.ID;
const Permission = Appwrite.Permission;
const Role      = Appwrite.Role;

/* =========================
SHARED HELPERS
========================= */
async function requireAuth() {
  try {
    return await account.get();
  } catch {
    window.location.replace("login.html");
    return null;
  }
}

function getUsernameFromEmail(email) {
  return email.split("@")[0].replace(/[^a-zA-Z0-9._]/g, "").toLowerCase();
}

async function logout() {
  try {
    await account.deleteSessions();
  } catch (e) {}
  window.location.href = "login.html";
}

// Calls the subscription_manager Appwrite Function. This is the ONLY path
// that ever creates/updates a subscriptions document — the client has no
// direct write permission on that collection (see README-APPWRITE.md).
async function callSubscriptionManager(action, payload) {
  const exec = await functions.createExecution(
    FUNC_SUBSCRIPTION_MANAGER,
    JSON.stringify({ action, ...payload }),
    false // synchronous — wait for the result
  );

  let result;
  try {
    result = JSON.parse(exec.responseBody || "{}");
  } catch {
    throw new Error("Unexpected response from server");
  }

  if (exec.responseStatusCode >= 400 || !result.ok) {
    throw new Error(result.message || "Something went wrong");
  }

  return result;
}

// Checks whether the current session belongs to the admins Team. Used to
// gate admin.html client-side — the real enforcement is Appwrite's own
// team-role permissions on platform_config / subscription_pins, this is
// just so non-admins don't see the screen at all.
async function isAdmin() {
  try {
    const res = await teams.list();
    return res.teams.some(t => t.$id === ADMIN_TEAM_ID);
  } catch {
    return false;
  }
}

// Calls the site_export Appwrite Function, which renders this project's
// stored content into a static site and pushes it to GitHub.
async function callSiteExport(projectId) {
  const exec = await functions.createExecution(
    FUNC_SITE_EXPORT,
    JSON.stringify({ projectId }),
    false
  );

  let result;
  try {
    result = JSON.parse(exec.responseBody || "{}");
  } catch {
    throw new Error("Unexpected response from server");
  }

  if (exec.responseStatusCode >= 400 || !result.ok) {
    throw new Error(result.message || "Publish failed");
  }

  return result;
}

const TRIAL_DAYS = 7;
