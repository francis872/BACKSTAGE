import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Card, Alert } from '../components/ui';
import '../styles/auth.css';

export const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data = await response.json();
      localStorage.setItem('authToken', data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-background">
        <div className="auth-gradient-1"></div>
        <div className="auth-gradient-2"></div>
      </div>

      <div className="auth-content">
        <Card className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">Backstage</h1>
            <p className="auth-subtitle">Geospatial Intelligence Platform</p>
          </div>

          {error && (
            <Alert
              type="error"
              message={error}
              closeable={true}
              onClose={() => setError('')}
            />
          )}

          <form onSubmit={handleLogin} className="auth-form">
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={isLoading}
              loading={isLoading}
              className="auth-button"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="auth-divider">Or</div>

          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => navigate('/signup')}
            className="auth-button"
          >
            Create Account
          </Button>

          <p className="auth-footer">
            Backstage Intelligence Platform • Secure Access Required
          </p>
        </Card>
      </div>
    </div>
  );
};

export default Login;
