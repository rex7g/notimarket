// src/lib/recaptcha.ts
// reCAPTCHA v3 loader — same dynamic script pattern as Google Maps in this project.
// Usage:
//   const token = await getRecaptchaToken('vote_survey')
//   POST /api/verify-captcha { token, action: 'vote_survey' }

declare global {
  interface Window {
    grecaptcha: {
      ready: (cb: () => void) => void
      execute: (siteKey: string, opts: { action: string }) => Promise<string>
    }
  }
}

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined

let _loaded = false

/** Injects the reCAPTCHA v3 script once; resolves immediately if already loaded. */
export function loadRecaptcha(): Promise<void> {
  if (_loaded || window.grecaptcha) {
    _loaded = true
    return Promise.resolve()
  }
  if (!SITE_KEY) {
    console.warn('[recaptcha] VITE_RECAPTCHA_SITE_KEY not set – reCAPTCHA disabled.')
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`
    s.async = true
    s.defer = true
    s.onload = () => { _loaded = true; resolve() }
    s.onerror = () => reject(new Error('reCAPTCHA script failed to load'))
    document.head.appendChild(s)
  })
}

/**
 * Returns a fresh reCAPTCHA v3 token for the given action.
 * Returns null if the site key is not configured (dev mode).
 */
export async function getRecaptchaToken(action: string): Promise<string | null> {
  if (!SITE_KEY) return null
  await loadRecaptcha()
  return new Promise(resolve =>
    window.grecaptcha.ready(() =>
      window.grecaptcha.execute(SITE_KEY!, { action }).then(resolve)
    )
  )
}
