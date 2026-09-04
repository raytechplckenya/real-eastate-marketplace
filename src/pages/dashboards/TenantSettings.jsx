// src/pages/dashboards/TenantSettings.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Bell, Shield, Globe, ArrowLeft, ToggleLeft, ToggleRight, Moon, Sun, AlertCircle } from 'lucide-react';
import '../../styles/tenant-settings.css';

export default function TenantSettings() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  
  const [settings, setSettings] = useState({
    emailNotifications: true,
    pushNotifications: true,
    darkMode: false,
    language: 'en',
    privacy: 'public',
    showContactInfo: true,
    marketingEmails: false
  });

  const toggleSetting = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  const handleSelectChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    // In a real app, save to database here
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const getLanguageLabel = (code) => {
    const languages = {
      en: 'English',
      sw: 'Swahili',
      fr: 'French'
    };
    return languages[code] || code;
  };

  return (
    <div className="settings-page">
      <button className="back-btn" onClick={() => navigate('/dashboard')}>
        <ArrowLeft size={18} /> Back to Dashboard
      </button>

      <div className="settings-header">
        <h1><Settings size={24} /> Settings</h1>
        <p className="settings-subtitle">Manage your account preferences</p>
      </div>

      {saved && (
        <div className="settings-saved-banner">
          ✅ Settings saved successfully!
        </div>
      )}

      <div className="settings-container">
        {/* Notifications Section */}
        <div className="settings-section">
          <h3><Bell size={18} /> Notifications</h3>
          <div className="settings-item">
            <div className="settings-item-info">
              <p>Email Notifications</p>
              <span>Receive property updates and messages via email</span>
            </div>
            <button 
              className="settings-toggle-btn"
              onClick={() => toggleSetting('emailNotifications')}
              aria-label="Toggle email notifications"
            >
              {settings.emailNotifications ? (
                <ToggleRight size={28} color="#5a1a20" />
              ) : (
                <ToggleLeft size={28} color="#8a7274" />
              )}
            </button>
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <p>Push Notifications</p>
              <span>Receive real-time notifications on your device</span>
            </div>
            <button 
              className="settings-toggle-btn"
              onClick={() => toggleSetting('pushNotifications')}
              aria-label="Toggle push notifications"
            >
              {settings.pushNotifications ? (
                <ToggleRight size={28} color="#5a1a20" />
              ) : (
                <ToggleLeft size={28} color="#8a7274" />
              )}
            </button>
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <p>Marketing Emails</p>
              <span>Receive promotional offers and property recommendations</span>
            </div>
            <button 
              className="settings-toggle-btn"
              onClick={() => toggleSetting('marketingEmails')}
              aria-label="Toggle marketing emails"
            >
              {settings.marketingEmails ? (
                <ToggleRight size={28} color="#5a1a20" />
              ) : (
                <ToggleLeft size={28} color="#8a7274" />
              )}
            </button>
          </div>
        </div>

        {/* Preferences Section */}
        <div className="settings-section">
          <h3><Globe size={18} /> Preferences</h3>
          <div className="settings-item">
            <div className="settings-item-info">
              <p>
                {settings.darkMode ? <Moon size={16} /> : <Sun size={16} />}
                Dark Mode
              </p>
              <span>Switch between light and dark theme</span>
            </div>
            <button 
              className="settings-toggle-btn"
              onClick={() => toggleSetting('darkMode')}
              aria-label="Toggle dark mode"
            >
              {settings.darkMode ? (
                <ToggleRight size={28} color="#5a1a20" />
              ) : (
                <ToggleLeft size={28} color="#8a7274" />
              )}
            </button>
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <p>Language</p>
              <span>Select your preferred language</span>
            </div>
            <select 
              value={settings.language}
              onChange={(e) => handleSelectChange('language', e.target.value)}
              className="settings-select"
            >
              <option value="en">🇬🇧 English</option>
              <option value="sw">🇰🇪 Swahili</option>
              <option value="fr">🇫🇷 French</option>
            </select>
          </div>
        </div>

        {/* Privacy Section */}
        <div className="settings-section">
          <h3><Shield size={18} /> Privacy</h3>
          <div className="settings-item">
            <div className="settings-item-info">
              <p>Profile Visibility</p>
              <span>Control who can see your profile information</span>
            </div>
            <select 
              value={settings.privacy}
              onChange={(e) => handleSelectChange('privacy', e.target.value)}
              className="settings-select"
            >
              <option value="public">🌍 Public</option>
              <option value="private">🔒 Private</option>
              <option value="agents">🤝 Agents Only</option>
            </select>
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <p>Show Contact Info</p>
              <span>Allow agents to see your phone and email</span>
            </div>
            <button 
              className="settings-toggle-btn"
              onClick={() => toggleSetting('showContactInfo')}
              aria-label="Toggle contact info visibility"
            >
              {settings.showContactInfo ? (
                <ToggleRight size={28} color="#5a1a20" />
              ) : (
                <ToggleLeft size={28} color="#8a7274" />
              )}
            </button>
          </div>
        </div>

        {/* Save Button */}
        <button className="settings-save-btn" onClick={handleSave}>
          Save All Settings
        </button>

        <div className="settings-danger-zone">
          <h4><AlertCircle size={16} /> Danger Zone</h4>
          <div className="settings-item">
            <div className="settings-item-info">
              <p>Delete Account</p>
              <span>Permanently delete your account and all associated data</span>
            </div>
            <button className="settings-delete-btn">
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}