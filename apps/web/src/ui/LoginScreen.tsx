import { FormEvent, useEffect, useState } from 'react';
import { LockKeyhole, LogIn, UserPlus } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../store/auth';

export const LoginScreen = () => {
  const createBootstrapAdmin = useAuth((state) => state.createBootstrapAdmin);
  const login = useAuth((state) => state.login);
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('admin@pdi.local');
  const [password, setPassword] = useState('admin123');
  const [canCreateAdmin, setCanCreateAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void api
      .bootstrapStatus()
      .then((status) => {
        setCanCreateAdmin(status.canCreateAdmin);
        if (status.canCreateAdmin) {
          setEmail('');
          setPassword('');
        }
      })
      .catch(() => setCanCreateAdmin(false));
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (canCreateAdmin) {
        await createBootstrapAdmin({ email, name: adminName, password });
        return;
      }

      await login(email, password);
    } catch {
      setError(canCreateAdmin ? 'Could not create admin user' : 'Invalid email or password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-visual" aria-label="PDI Portal">
        <div>
          <p>PDI Portal</p>
          <h1>Development plans with a living canvas.</h1>
          <span>Goals, actions, feedback loops and team follow-up in one workspace.</span>
        </div>
      </section>

      <form className="login-panel" onSubmit={handleSubmit}>
        <LockKeyhole aria-hidden="true" />
        <h2>{canCreateAdmin ? 'Create first admin' : 'Sign in'}</h2>
        {canCreateAdmin ? (
          <label>
            Name
            <input
              minLength={2}
              onChange={(event) => setAdminName(event.target.value)}
              required
              type="text"
              value={adminName}
            />
          </label>
        ) : null}
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} required type="email" />
        </label>
        <label>
          Password
          <input
            minLength={canCreateAdmin ? 8 : 6}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button disabled={isSubmitting} type="submit">
          {canCreateAdmin ? <UserPlus size={18} /> : <LogIn size={18} />}
          {isSubmitting ? (canCreateAdmin ? 'Creating admin' : 'Signing in') : canCreateAdmin ? 'Create admin' : 'Enter platform'}
        </button>
      </form>
    </main>
  );
};
