import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Coffee } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@madda.local');
  const [password, setPassword] = useState('Admin@12345');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-copper-500 text-white">
            <Coffee size={26} />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">{t('app.name')}</h1>
          <p className="text-sm text-slate-500">{t('app.subtitle')}</p>
        </div>
        <div className="card p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-900">{t('auth.welcome')}</h2>
          <p className="mb-5 text-sm text-slate-500">{t('auth.signInSubtitle')}</p>
          <form onSubmit={submit} className="space-y-4">
            <Field label={t('auth.email')}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label={t('auth.password')}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('common.loading') : t('auth.signIn')}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          Ancient Halo Coffee Export · MADDA ERP
        </p>
      </div>
    </div>
  );
}
