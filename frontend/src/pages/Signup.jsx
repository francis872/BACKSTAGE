import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Card, Alert, Select, Badge } from '../components/ui';
import '../styles/auth.css';

const ROLE_OPTIONS = [
  { value: 'analyst', label: 'Analyst - Data & Analysis' },
  { value: 'manager', label: 'Manager - Portfolio Management' },
  { value: 'observer', label: 'Observer - Read-Only Access' },
];

export const Signup = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: '',
  });
  const [error, setError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const evaluatePasswordStrength = (pwd) => {
    if (!pwd) return '';
    if (pwd.length < 8) return 'weak';
    if (/^[a-zA-Z0-9]*$/.test(pwd)) return 'weak';
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd) && /[^a-zA-Z0-9]/.test(pwd)) {
      return 'strong';
    }
    return 'medium';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (name === 'password') {
      setPasswordStrength(evaluatePasswordStrength(value));
    }
  };

  const handleRoleChange = (selectedOption) => {
    setFormData((prev) => ({
      ...prev,
      role: selectedOption.value,
    }));
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (passwordStrength !== 'strong') {
      setError('Password must be strong (8+ chars, uppercase, lowercase, numbers, symbols)');
      return;
    }

    if (!formData.role) {
      setError('Please select a role');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password,
          role: formData.role,
        }),
      });

      if (!response.ok) {
        throw new Error('Signup failed');
      }

      navigate('/login');
    } catch (err) {
      setError(err.message || 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  const strengthColors = {
    weak: 'error',
    medium: 'warning',
    strong: 'success',
  };

  return (
    <div className="auth-container">
      <div className="auth-background">
        <div className="auth-gradient-1"></div>
        <div className="auth-gradient-2"></div>
      </div>

      <div className="auth-content">
        <Card className="auth-card auth-card-large">
          <div className="auth-header">
            <h1 className="auth-title">Create Account</h1>
            <p className="auth-subtitle">Join Backstage Intelligence Platform</p>
          </div>

          {error && (
            <Alert
              type="error"
              message={error}
              closeable={true}
              onClose={() => setError('')}
            />
          )}

          <form onSubmit={handleSignup} className="auth-form">
            <div className="form-row">
              <Input
                type="text"
                placeholder="First name"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                required
              />
              <Input
                type="text"
                placeholder="Last name"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                required
              />
            </div>

            <Input
              type="email"
              placeholder="Email address"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
            />

            <Input
              type="password"
              placeholder="Password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              helper={
                formData.password && (
                  <div className="password-strength">
                    <Badge color={strengthColors[passwordStrength]}>
                      {passwordStrength.charAt(0).toUpperCase() + passwordStrength.slice(1)}
                    </Badge>
                  </div>
                )
              }
            />

            <Input
              type="password"
              placeholder="Confirm password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />

            <Select
              options={ROLE_OPTIONS}
              placeholder="Select your role"
              value={formData.role ? { value: formData.role, label: ROLE_OPTIONS.find(r => r.value === formData.role)?.label } : null}
              onChange={handleRoleChange}
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
              {isLoading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <div className="auth-divider">Already have an account?</div>

          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => navigate('/login')}
            className="auth-button"
          >
            Sign In
          </Button>

          <p className="auth-footer">
            By creating an account, you agree to our Terms of Service
          </p>
        </Card>
      </div>
    </div>
  );
};

export default Signup;
