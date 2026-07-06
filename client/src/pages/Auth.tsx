import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';
import styles from './Auth.module.css';

type Tab = 'login' | 'register';

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
