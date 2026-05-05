import { FormEvent, useState } from 'react';
import { LockKeyhole, LogIn } from 'lucide-react';
import { useAuth } from '../store/auth';

export const LoginScreen = () => {
  const login = useAuth((state) => state.login);
  const [email, setEmail] = useState('admin@pdi.local');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch {
      setError('Invalid email or password');
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
        <h2>Sign in</h2>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        </label>
        <label>
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button disabled={isSubmitting} type="submit">
          <LogIn size={18} />
          {isSubmitting ? 'Signing in' : 'Enter platform'}
        </button>
      </form>
    </main>
  );
};
