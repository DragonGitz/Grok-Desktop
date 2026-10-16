// Shared URL policy for Grok Desktop (used by main process and index.html).
// Decides which URLs stay inside the app (Grok, xAI, sign-in providers) and
// which are opened in the user's default browser.

// Hosts (and all their subdomains) that are always handled in-app.
const IN_APP_DOMAINS = ['grok.com', 'x.ai'];

// Third-party sign-in providers used by accounts.x.ai.
const AUTH_HOSTS = ['accounts.google.com', 'appleid.apple.com'];

// X / Twitter: only the OAuth / login paths stay in-app; everything else
// (posts, profiles) opens in the browser.
const X_DOMAINS = ['x.com', 'twitter.com'];
const X_AUTH_PATH = /^\/(i\/oauth2|oauth|login|logout|i\/flow|account\/access|sessions)(\/|$)/i;

function hostMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith('.' + domain);
}

function parse(url) {
  try { return new URL(url); } catch (_) { return null; }
}

// True if the URL should be loaded inside the app.
function isInAppUrl(url) {
  const u = parse(url);
  if (!u) return false;
  if (u.protocol === 'about:') return true;
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  if (IN_APP_DOMAINS.some(d => hostMatches(host, d))) return true;
  if (AUTH_HOSTS.includes(host)) return true;
  if (X_DOMAINS.some(d => hostMatches(host, d)) && X_AUTH_PATH.test(u.pathname)) return true;
  return false;
}

// True for sign-in popups that need a real child window (window.opener /
// postMessage based flows such as Google or Apple sign-in).
function isAuthPopupUrl(url) {
  const u = parse(url);
  if (!u || u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (AUTH_HOSTS.includes(host)) return true;
  if (hostMatches(host, 'accounts.x.ai')) return true;
  return X_DOMAINS.some(d => hostMatches(host, d)) && X_AUTH_PATH.test(u.pathname);
}

// True if the URL is safe to hand to shell.openExternal.
function isSafeExternalUrl(url) {
  const u = parse(url);
  return !!u && ['https:', 'http:', 'mailto:'].includes(u.protocol);
}

module.exports = { isInAppUrl, isAuthPopupUrl, isSafeExternalUrl };
