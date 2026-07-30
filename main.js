import { supabase, signInWithEmail, signUpWithEmail, signInWithMagicLink } from './supabase.js'
import { pullFromSupabase } from './sync.js'

export function renderAuthScreen() {
  return `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:20px;">
      <div style="width:100%;max-width:360px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="font-size:32px;margin-bottom:8px;">📋</div>
          <div style="font-size:22px;font-weight:700;color:var(--text);">Draft Logger</div>
          <div style="font-size:13px;color:var(--muted);margin-top:4px;">Sign in to continue</div>
        </div>

        <div id="auth-error" style="display:none;background:rgba(255,77,94,.1);border:1px solid #ff4d5e;border-radius:8px;padding:10px 14px;font-size:13px;color:#ff4d5e;margin-bottom:16px;"></div>
        <div id="auth-success" style="display:none;background:rgba(62,207,142,.1);border:1px solid var(--green);border-radius:8px;padding:10px 14px;font-size:13px;color:var(--green);margin-bottom:16px;"></div>

        <div style="background:var(--surface);border-radius:12px;border:1px solid var(--border);overflow:hidden;">
          <!-- Tab headers -->
          <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--border);">
            <button id="tab-signin" onclick="authTab('signin')"
              style="padding:12px;font-size:13px;font-weight:600;background:var(--blue-dim);color:var(--blue);border:none;cursor:pointer;border-bottom:2px solid var(--blue);">
              Sign in
            </button>
            <button id="tab-signup" onclick="authTab('signup')"
              style="padding:12px;font-size:13px;font-weight:600;background:none;color:var(--muted);border:none;cursor:pointer;border-bottom:2px solid transparent;">
              Create account
            </button>
          </div>

          <div style="padding:20px;">
            <div>
              <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:6px;">Email</label>
              <input id="auth-email" type="email" placeholder="you@example.com"
                style="width:100%;box-sizing:border-box;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;margin-bottom:12px;" />
            </div>
            <div id="auth-password-wrap">
              <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:6px;">Password</label>
              <input id="auth-password" type="password" placeholder="••••••••"
                style="width:100%;box-sizing:border-box;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;margin-bottom:16px;" />
            </div>
            <button id="auth-submit" onclick="authSubmit()"
              style="width:100%;padding:12px;background:var(--blue);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:12px;">
              Sign in
            </button>
            <button onclick="authMagicLink()"
              style="width:100%;padding:10px;background:none;border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--muted);cursor:pointer;">
              ✉ Send magic link instead
            </button>
          </div>
        </div>
      </div>
    </div>`
}

export function initAuth(onSignedIn) {
  // Expose auth functions to global scope for onclick handlers
  window.authTab = (tab) => {
    const isSignIn = tab === 'signin'
    document.getElementById('tab-signin').style.cssText += isSignIn
      ? 'background:var(--blue-dim);color:var(--blue);border-bottom:2px solid var(--blue);'
      : 'background:none;color:var(--muted);border-bottom:2px solid transparent;'
    document.getElementById('tab-signup').style.cssText += !isSignIn
      ? 'background:var(--blue-dim);color:var(--blue);border-bottom:2px solid var(--blue);'
      : 'background:none;color:var(--muted);border-bottom:2px solid transparent;'
    document.getElementById('auth-submit').textContent = isSignIn ? 'Sign in' : 'Create account'
    window._authTab = tab
  }
  window._authTab = 'signin'

  window.authSubmit = async () => {
    const email    = document.getElementById('auth-email')?.value?.trim()
    const password = document.getElementById('auth-password')?.value
    const errEl    = document.getElementById('auth-error')
    const btn      = document.getElementById('auth-submit')
    if (!email || !password) { showAuthError('Enter your email and password.'); return }
    btn.textContent = 'Loading…'; btn.disabled = true
    const { error } = window._authTab === 'signin'
      ? await signInWithEmail(email, password)
      : await signUpWithEmail(email, password)
    btn.disabled = false
    btn.textContent = window._authTab === 'signin' ? 'Sign in' : 'Create account'
    if (error) { showAuthError(error.message); return }
    if (window._authTab === 'signup') {
      showAuthSuccess('Account created! Check your email to confirm, then sign in.')
      return
    }
    onSignedIn()
  }

  window.authMagicLink = async () => {
    const email = document.getElementById('auth-email')?.value?.trim()
    if (!email) { showAuthError('Enter your email first.'); return }
    const { error } = await signInWithMagicLink(email)
    if (error) { showAuthError(error.message); return }
    showAuthSuccess('Magic link sent! Check your email.')
  }

  function showAuthError(msg) {
    const el = document.getElementById('auth-error')
    if (el) { el.textContent = msg; el.style.display = 'block' }
  }
  function showAuthSuccess(msg) {
    const el = document.getElementById('auth-success')
    const errEl = document.getElementById('auth-error')
    if (el)    { el.textContent = msg; el.style.display = 'block' }
    if (errEl) errEl.style.display = 'none'
  }
}
