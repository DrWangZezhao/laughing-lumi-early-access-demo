// Public configuration only. Never put a database password or service-role key here.
window.LUMI_CONFIG = Object.freeze({
  REAL_SIGNUP_ENABLED: true,
  PRIVACY_READY: true,
  PRIVACY_NOTICE_VERSION: 'public-2026-10-08',
  SIGNUP_ENDPOINT: 'https://vgeseoyoztogthygvzog.supabase.co/functions/v1/signup',
  DEMO_REDIRECT_ENABLED: false,
  // Relative to this site's root, so GitHub project Pages works correctly.
  DEMO_REDIRECT_URL: './demo/',
  TRUSTED_DEMO_ORIGINS: [],
});
