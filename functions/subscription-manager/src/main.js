/* =========================
FILE OVERVIEW
========================= */
// Appwrite Function: subscription_manager
//
// Owns every write to the `subscriptions` collection so a client can never
// grant itself an active subscription. Deploy this, give it a dynamic-key
// scope of databases.read + databases.write, set execute access to "users",
// and set the EKI_DB_ID variable (see README-APPWRITE.md).
//
// Two actions, both called via functions.createExecution() from the client:
//
//   { action: "ensure_trial",  projectId }          -> idempotent trial start
//   { action: "activate_pin",  projectId, code }     -> validates + burns a PIN
//
// Both actions verify the calling user (from x-appwrite-user-id, only
// present on an authenticated execution) actually owns the project before
// touching anything.

import { Client, Databases, Query, ID } from 'node-appwrite';

const DB_ID              = process.env.EKI_DB_ID;
const COL_PROJECTS       = 'projects';
const COL_SUBSCRIPTIONS  = 'subscriptions';
const COL_PINS           = 'subscription_pins';
const TRIAL_DAYS         = 7;

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key'] ?? '');

  const databases = new Databases(client);

  // Only present when the execution was made with a logged-in user's
  // session/JWT — this is what stops an anonymous caller from doing anything.
  const userId = req.headers['x-appwrite-user-id'];
  if (!userId) {
    return res.json({ ok: false, message: 'You must be logged in.' }, 401);
  }

  if (!DB_ID) {
    error('EKI_DB_ID function variable is not set');
    return res.json({ ok: false, message: 'Server is not configured yet.' }, 500);
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return res.json({ ok: false, message: 'Invalid request body.' }, 400);
  }

  const { action, projectId } = body;

  if (!action || !projectId) {
    return res.json({ ok: false, message: 'Missing action or projectId.' }, 400);
  }

  // Every action needs the project, and needs to confirm the caller owns it.
  let project;
  try {
    project = await databases.getDocument(DB_ID, COL_PROJECTS, projectId);
  } catch {
    return res.json({ ok: false, message: 'Website not found.' }, 404);
  }

  if (project.userId !== userId) {
    return res.json({ ok: false, message: 'You do not have access to this website.' }, 403);
  }

  try {
    if (action === 'ensure_trial') {
      return res.json(await ensureTrial(databases, project));
    }

    if (action === 'activate_pin') {
      return res.json(await activatePin(databases, project, body.code, userId, log));
    }

    return res.json({ ok: false, message: 'Unknown action.' }, 400);

  } catch (err) {
    error(err.message);
    return res.json({ ok: false, message: 'Something went wrong. Please try again.' }, 500);
  }
};

/* =========================
ACTIONS
========================= */

// Creates the trial subscription record the first time it's called for a
// project, anchored to the project's own $createdAt — so calling this
// again later can never push the trial window forward.
async function ensureTrial(databases, project) {
  try {
    const existing = await databases.getDocument(DB_ID, COL_SUBSCRIPTIONS, project.$id);
    return { ok: true, subscription: existing };
  } catch {
    // No document yet — fall through and create one.
  }

  const trialEndsAt = new Date(new Date(project.$createdAt).getTime() + TRIAL_DAYS * 86400000).toISOString();

  const sub = await databases.createDocument(DB_ID, COL_SUBSCRIPTIONS, project.$id, {
    projectId: project.$id,
    userId: project.userId,
    status: 'trial',
    plan: null,
    trialEndsAt,
    expiresAt: null
  });

  return { ok: true, subscription: sub };
}

// Validates a PIN, burns it, and activates the subscription for this project.
async function activatePin(databases, project, rawCode, userId, log) {
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) {
    return { ok: false, message: 'Enter a PIN code.' };
  }

  const pinRes = await databases.listDocuments(DB_ID, COL_PINS, [
    Query.equal('code', code),
    Query.limit(1)
  ]);

  if (!pinRes.documents.length) {
    return { ok: false, message: 'PIN not found.' };
  }

  const pin = pinRes.documents[0];

  if (pin.status === 'used') {
    return { ok: false, message: 'This PIN has already been used.' };
  }

  const durationDays = Number(pin.durationDays) || 30;
  const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();

  // Upsert the subscriptions doc — it may not exist yet if ensure_trial was
  // never called (e.g. an older project), so handle both cases.
  let sub;
  const payload = {
    projectId: project.$id,
    userId: project.userId,
    status: 'active',
    plan: pin.plan || `${durationDays} days`,
    expiresAt
  };

  try {
    sub = await databases.updateDocument(DB_ID, COL_SUBSCRIPTIONS, project.$id, payload);
  } catch {
    sub = await databases.createDocument(DB_ID, COL_SUBSCRIPTIONS, project.$id, { trialEndsAt: null, ...payload });
  }

  await databases.updateDocument(DB_ID, COL_PINS, pin.$id, {
    status: 'used',
    activatedAt: new Date().toISOString(),
    usedByProjectId: project.$id,
    usedByUserId: userId
  });

  log(`PIN ${code} activated for project ${project.$id} by user ${userId}`);

  return { ok: true, message: 'Subscription activated.', subscription: sub };
}
