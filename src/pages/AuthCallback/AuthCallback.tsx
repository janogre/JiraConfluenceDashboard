import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export function AuthCallback() {
  const { checkAuth } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const authError = searchParams.get('auth_error');
    if (authError) {
      navigate('/?auth_error=' + authError);
      return;
    }
    checkAuth().then(() => navigate('/'));
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p style={{ color: 'var(--color-text-secondary)' }}>Autentiserer…</p>
    </div>
  );
}
