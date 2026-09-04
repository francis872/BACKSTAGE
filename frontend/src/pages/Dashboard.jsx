import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBarChart2, FiColumns, FiBriefcase, FiMap, FiGlobe } from 'react-icons/fi';
import { Card, Badge, Button, Alert } from '../components/ui';
import '../styles/dashboard.css';

const MODULES = [
  {
    id: 'probability-engine',
    title: 'Probability Engine',
    description: 'Statistical analysis and distribution fitting for geospatial variables',
    icon: FiBarChart2,
    status: 'active',
    actionLabel: 'Analyze',
    color: 'primary',
  },
  {
    id: 'comparador',
    title: 'Comparador Inteligente',
    description: 'Intelligent comparison and analysis of territorial assets',
    icon: FiColumns,
    status: 'active',
    actionLabel: 'Compare',
    color: 'secondary',
  },
  {
    id: 'portfolio',
    title: 'Portfolio Manager',
    description: 'Manage and track active projects, buyers, and assets',
    icon: FiBriefcase,
    status: 'active',
    actionLabel: 'Manage',
    color: 'accent',
  },
  {
    id: 'geospatial',
    title: 'Geospatial Analysis',
    description: 'Map-based territorial and location intelligence',
    icon: FiMap,
    status: 'active',
    actionLabel: 'Explore',
    color: 'success',
  },
  {
    id: 'earthart',
    title: 'EarthArt',
    description: 'Satellite imagery and environmental analysis',
    icon: FiGlobe,
    status: 'active',
    actionLabel: 'View',
    color: 'warning',
  },
];

const KPI_DATA = [
  { label: 'Active Projects', value: 24, trend: '+2' },
  { label: 'Portfolio Value', value: '$2.4M', trend: '+12%' },
  { label: 'Analysis Complete', value: 156, trend: '+8' },
  { label: 'Users Online', value: 12, trend: '+3' },
];

export const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (!token) {
          navigate('/login');
          return;
        }

        const response = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user');
        }

        const userData = await response.json();
        setUser(userData);
      } catch (err) {
        setError('Failed to load dashboard');
        setTimeout(() => navigate('/login'), 2000);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    navigate('/login');
  };

  const navigateToModule = (moduleId) => {
    navigate(`/modules/${moduleId}`);
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="header-content">
          <h1 className="header-title">Backstage</h1>
          <p className="header-subtitle">Geospatial Intelligence Command Center</p>
        </div>

        <div className="header-user">
          <div className="user-info">
            <p className="user-name">{user?.firstName} {user?.lastName}</p>
            <p className="user-role">{user?.role}</p>
          </div>
          <Button variant="ghost" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      {error && (
        <Alert
          type="error"
          message={error}
          closeable={true}
          onClose={() => setError('')}
        />
      )}

      {/* KPI Summary */}
      <div className="kpi-section">
        <h2 className="section-title">Key Performance Indicators</h2>
        <div className="kpi-grid">
          {KPI_DATA.map((kpi, idx) => (
            <Card key={idx} className="kpi-card">
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value">{kpi.value}</div>
              <div className="kpi-trend">{kpi.trend}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* Modules Grid */}
      <div className="modules-section">
        <h2 className="section-title">Intelligence Modules</h2>
        <div className="modules-grid">
          {MODULES.map((module) => (
            <Card
              key={module.id}
              className="module-card"
              onClick={() => navigateToModule(module.id)}
            >
              <div className="module-header">
                <span className="module-icon"><module.icon /></span>
                <Badge color={module.color} variant="solid" size="sm">
                  {module.status}
                </Badge>
              </div>

              <h3 className="module-title">{module.title}</h3>
              <p className="module-description">{module.description}</p>

              <Button
                variant="primary"
                size="sm"
                className="module-action"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateToModule(module.id);
                }}
              >
                {module.actionLabel}
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="activity-section">
        <h2 className="section-title">Recent Activity</h2>
        <Card className="activity-card">
          <div className="activity-empty">
            <p>No recent activity. Start by exploring an intelligence module.</p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
