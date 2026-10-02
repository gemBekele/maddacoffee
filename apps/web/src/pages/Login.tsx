import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, Eye, EyeOff } from 'lucide-react';
import { Button, Field, Input, Select } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { TEST_CREDENTIALS, testCredentialsEnabled } from '@/lib/test-credentials';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@madda.local');
  const [password, setPassword] = useState('Admin@12345');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError(t('auth.invalid'));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Pick an account from the test list.
   *
   * Fills the fields rather than signing straight in, so the form still shows
   * exactly what is being submitted and the normal submit path is exercised.
   */
  const pickCredential = (value: string) => {
    const cred = TEST_CREDENTIALS.find((c) => c.email === value);
    if (!cred) return;
    setEmail(cred.email);
    setPassword(cred.password);
    setError('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{t('app.name')}</h1>
          <p className="mt-1 text-xs text-slate-500">{t('app.subtitle')}</p>
        </div>

        <div className="card p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-900">{t('auth.welcome')}</h2>
          <p className="mb-5 text-sm text-slate-500">{t('auth.signInSubtitle')}</p>

          {/* Test-only account picker. Rendered only when the build enabled it. */}
          {testCredentialsEnabled && TEST_CREDENTIALS.length > 0 && (
            <div className="mb-5 rounded-lg border border-dashed border-copper-300 bg-copper-50 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-copper-700">
                <FlaskConical size={12} /> Test accounts
              </div>
              <Select
                value=""
                onChange={(e) => pickCredential(e.target.value)}
                className="h-9 bg-white text-xs"
                aria-label="Choose a test account"
              >
                <option value="">Choose an account to fill the form…</option>
                {TEST_CREDENTIALS.map((c) => (
                  <option key={c.email} value={c.email}>
                    {c.role} — {c.name}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-[10px] leading-relaxed text-copper-700">
                For testing only. Fills the form; it does not sign in by itself.
              </p>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <Field label={t('auth.email')}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label={t('auth.password')}>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('common.loading') : t('auth.signIn')}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Ancient Halo Coffee Export
        </p>
      </div>
    </div>
  );
}
