// src/pages/dashboards/TenantProfile.jsx
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { User, Mail, Phone, MapPin, ArrowLeft, Save, Camera, X } from 'lucide-react';
import '../../styles/tenant-profile.css';

export default function TenantProfile() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
    location: profile?.location || '',
    bio: profile?.bio || ''
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || null);
  const [message, setMessage] = useState({ type: '', text: '' });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // Clear message when user starts typing
    if (message.text) setMessage({ type: '', text: '' });
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select an image file' });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be less than 2MB' });
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result);
    reader.readAsDataURL(file);
    setMessage({ type: '', text: '' });
  };

  const uploadAvatar = async () => {
    if (!avatarFile) return null;

    const fileExt = avatarFile.name.split('.').pop();
    const fileName = `${profile.id}/avatar.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('profiles')
      .upload(filePath, avatarFile, { upsert: true });

    if (uploadError) {
      console.error('Avatar upload error:', uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('profiles')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      let avatarUrl = profile?.avatar_url;

      // Upload avatar if changed
      if (avatarFile) {
        setUploading(true);
        const uploadedUrl = await uploadAvatar();
        if (uploadedUrl) {
          avatarUrl = uploadedUrl;
        }
        setUploading(false);
      }

      // Update profile
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          phone: formData.phone,
          location: formData.location,
          bio: formData.bio,
          avatar_url: avatarUrl
        })
        .eq('id', profile.id);

      if (error) throw error;

      // Refresh the profile context
      await refreshProfile();

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      setAvatarFile(null);

      // Clear success message after 3 seconds
      setTimeout(() => {
        setMessage({ type: '', text: '' });
      }, 3000);

    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-page">
      <button className="back-btn" onClick={() => navigate('/dashboard')}>
        <ArrowLeft size={18} /> Back to Dashboard
      </button>

      <div className="profile-header">
        <h1><User size={24} /> Profile Settings</h1>
        <p className="profile-subtitle">Manage your personal information</p>
      </div>

      {message.text && (
        <div className={`profile-message ${message.type}`}>
          {message.text}
          <button className="message-close" onClick={() => setMessage({ type: '', text: '' })}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="profile-container">
        <div className="profile-avatar-section">
          <div className="profile-avatar-wrapper">
            <img 
              src={avatarPreview || 'https://placehold.co/120x120?text=👤'} 
              alt={profile?.full_name}
              className="profile-avatar"
            />
            <button 
              className="avatar-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              type="button"
              disabled={uploading}
            >
              <Camera size={16} />
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            style={{ display: 'none' }}
          />
          <p className="avatar-hint">Click the camera icon to change your photo</p>
          {avatarFile && (
            <p className="avatar-file-name">Selected: {avatarFile.name}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="profile-form">
          <div className="profile-form-group">
            <label htmlFor="full_name">Full Name</label>
            <input
              id="full_name"
              type="text"
              name="full_name"
              value={formData.full_name}
              onChange={handleChange}
              placeholder="Enter your full name"
              required
            />
          </div><br />

          <div className="profile-form-group">
            <label htmlFor="email">
              <Mail size={16} /> Email
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              disabled
              className="profile-form-disabled"
            />
            <p className="field-hint">Email cannot be changed</p>
          </div><br />

          <div className="profile-form-group">
            <label htmlFor="phone">
              <Phone size={16} /> Phone Number
            </label>
            <input
              id="phone"
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+254 700 000 000"
            />
          </div><br />

          <div className="profile-form-group">
            <label htmlFor="location">
              <MapPin size={16} /> Location
            </label>
            <input
              id="location"
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="Nairobi, Kenya"
            />
          </div><br />

          <div className="profile-form-group">
            <label htmlFor="bio">About You</label>
            <textarea
              id="bio"
              name="bio"
              value={formData.bio}
              onChange={handleChange}
              rows={4}
              placeholder="Tell us about your property preferences, budget range, or any special requirements..."
            />
          </div>

          <button 
            type="submit" 
            className="profile-save-btn" 
            disabled={loading || uploading}
          >
            <Save size={18} /> 
            {loading ? 'Saving...' : uploading ? 'Uploading Photo...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}