import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';
import styles from './Auth.module.css';

// Extend window to expose the Google GSI API + the onGoogleLibraryLoad callback
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          renderButton: (element: HTMLElement, config: object) => void;
          prompt: () => void;
        };
      };
    };
    onGoogleLibraryLoad?: () => void;
  }
}

type Tab = 'login' | 'register';

// Module-level flag — prevents double-init in React StrictMode
let gsiInitialized = false;

export default function Auth() {
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // ── Google credential handler — defined first so renderGSI can close over it ──
  const handleGoogleCredential = useCallback(
    async (response: { credential: string }) => {
      setError('');
      setIsLoading(true);
      try {
        const result = await api.auth.googleLogin(response.credential);
        setAuth(result.user, result.token);
        navigate('/dashboard', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Google sign-in failed');
      } finally {
        setIsLoading(false);
      }
    },
    [setAuth, navigate]
  );

  // ── Initialize / re-render the GSI button ────────────────────────────────────
  const renderGSI = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId || !window.google || !googleBtnRef.current) return;

    // Clear any previously rendered button
    googleBtnRef.current.innerHTML = '';

    // initialize() must only be called once per page load
    if (!gsiInitialized) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      gsiInitialized = true;
    }

    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      width: 356,
      text: tab === 'login' ? 'signin_with' : 'signup_with',
      logo_alignment: 'left',
    });
  }, [tab, handleGoogleCredential]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) return;

    if (window.google) {
      // GSI script already loaded (e.g. fast connection or HMR)
      renderGSI();
    } else {
      // Register Google's official "library ready" callback.
      // GSI calls window.onGoogleLibraryLoad automatically once it finishes loading.
      window.onGoogleLibraryLoad = renderGSI;
    }

    return () => {
      // Cleanup so we don't leak the global on unmount
      if (window.onGoogleLibraryLoad === renderGSI) {
        delete window.onGoogleLibraryLoad;
      }
    };
  }, [renderGSI]);

  // ── Email/password form submit ────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      let result;
      if (tab === 'login') {
        result = await api.auth.login(email, password);
      } else {
        result = await api.auth.register(email, password, displayName);
      }
      setAuth(result.user, result.token);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.orb} />

      {/* Back to home */}
      <Link to="/" className={styles.backLink}>
        <div className={styles.logo}>
          <div className={styles.logoMark}>C</div>
          <span>CollabSpace</span>
        </div>
      </Link>

      <div className={`modal ${styles.card} animate-scale-in`}>
        {/* Tab switcher */}
        <div className={styles.tabs} role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'login'}
            className={`${styles.tab} ${tab === 'login' ? styles.tabActive : ''}`}
            onClick={() => { setTab('login'); setError(''); }}
            id="tab-login"
          >
            Sign In
          </button>
          <button
            role="tab"
            aria-selected={tab === 'register'}
            className={`${styles.tab} ${tab === 'register' ? styles.tabActive : ''}`}
            onClick={() => { setTab('register'); setError(''); }}
            id="tab-register"
          >
            Create Account
          </button>
        </div>

        <div className={styles.cardBody}>
          <h1 className={styles.heading}>
            {tab === 'login' ? 'Welcome back' : 'Get started free'}
          </h1>
          <p className={styles.sub}>
            {tab === 'login'
              ? 'Sign in to your CollabSpace account.'
              : 'Create an account and start collaborating.'}
          </p>

          {/* Google Sign-In button — GSI renders an iframe inside this div */}
          <div className={styles.googleBtnWrapper}>
            <div ref={googleBtnRef} id="google-signin-btn" style={{ width: '100%' }} />
          </div>

          {/* Divider */}
          <div className={styles.divider}>
            <span className={styles.dividerLine} />
            <span className={styles.dividerText}>or continue with email</span>
            <span className={styles.dividerLine} />
          </div>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            {tab === 'register' && (
              <div className={styles.field}>
                <label className="label" htmlFor="displayName">Display Name</label>
                <div className={styles.inputWrapper}>
                  <User size={16} className={styles.inputIcon} />
                  <input
                    id="displayName"
                    className={`input ${styles.inputWithIcon}`}
                    type="text"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={32}
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div className={styles.field}>
              <label className="label" htmlFor="email">Email</label>
              <div className={styles.inputWrapper}>
                <Mail size={16} className={styles.inputIcon} />
                <input
                  id="email"
                  className={`input ${styles.inputWithIcon}`}
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className="label" htmlFor="password">Password</label>
              <div className={styles.inputWrapper}>
                <Lock size={16} className={styles.inputIcon} />
                <input
                  id="password"
                  className={`input ${styles.inputWithIcon} ${styles.inputPaddingRight}`}
                  type={showPassword ? 'text' : 'password'}
                  placeholder={tab === 'register' ? 'At least 8 characters' : '••••••••'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={tab === 'register' ? 8 : 1}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className={styles.errorBox} role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 'var(--space-2)' }}
              disabled={isLoading}
              id="auth-submit"
            >
              {isLoading ? (
                <span className="spinner" style={{ width: 18, height: 18 }} />
              ) : (
                <>
                  <Zap size={16} />
                  {tab === 'login' ? 'Sign In' : 'Create Account'}
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
