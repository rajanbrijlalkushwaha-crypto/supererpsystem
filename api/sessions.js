/**
 * sessions.js — shared in-memory session store
 * Imported by auth.js (to write sessions) and helpers.js (to read them).
 */
const SESSIONS = new Map();
module.exports = SESSIONS;
