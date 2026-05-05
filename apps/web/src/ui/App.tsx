import { useEffect } from 'react';
import { Workspace } from './Workspace';
import { LoginScreen } from './LoginScreen';
import { useAuth } from '../store/auth';

export const App = () => {
  const { bootstrap, isBootstrapping, user } = useAuth();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (isBootstrapping) {
    return <div className="boot">Loading workspace</div>;
  }

  return user ? <Workspace /> : <LoginScreen />;
};
