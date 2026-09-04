// src/pages/dashboards/TenantSavedProperties.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Heart, MapPin, Search, ArrowLeft, Trash2, Home } from 'lucide-react';
import '../../styles/tenant-saved.css';

export default function TenantSavedProperties() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [savedProperties, setSavedProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSavedProperties = async () => {
      try {
        const { data, error } = await supabase
          .from('favorites')
          .select(`
            listing_id,
            listings:listing_id (
              id,
              title,
              price,
              address,
              images,
              bedrooms,
              bathrooms,
              property_type,
              created_at
            )
          `)
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setSavedProperties(data?.map(f => f.listings) || []);
      } catch (error) {
        console.error('Error fetching saved properties:', error);
      } finally {
        setLoading(false);
      }
    };

    if (profile?.id) {
      fetchSavedProperties();
    }
  }, [profile.id]);

  const removeSaved = async (listingId) => {
    try {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', profile.id)
        .eq('listing_id', listingId);
      
      if (error) throw error;
      setSavedProperties(prev => prev.filter(p => p.id !== listingId));
    } catch (error) {
      console.error('Error removing saved property:', error);
    }
  };

  const formatPrice = (price) => `KES ${parseFloat(price || 0).toLocaleString()}`;

  if (loading) {
    return (
      <div className="saved-loading">
        <div className="loading-spinner"></div>
        <p>Loading your saved properties...</p>
      </div>
    );
  }

  return (
    <div className="saved-page">
      <button className="back-btn" onClick={() => navigate('/dashboard')}>
        <ArrowLeft size={18} /> Back to Dashboard
      </button>

      <div className="saved-header">
        <h1><Heart size={24} /> Saved Properties</h1>
        <p className="saved-count">{savedProperties.length} properties saved</p>
      </div>

      {savedProperties.length === 0 ? (
        <div className="saved-empty">
          <Heart size={48} />
          <h3>No saved properties yet</h3>
          <p>Start exploring and save properties you love</p>
          <button className="browse-btn" onClick={() => navigate('/listings')}>
            <Search size={16} /> Browse Properties
          </button>
        </div>
      ) : (
        <div className="saved-grid">
          {savedProperties.map(property => (
            <div key={property.id} className="saved-card">
              <div className="saved-card-image-wrapper">
                <img 
                  src={property.images?.[0]?.url || 'https://placehold.co/400x300?text=No+Image'} 
                  alt={property.title}
                  onClick={() => navigate(`/listings/${property.id}`)}
                  className="saved-card-image"
                />
                <button 
                  className="saved-remove-btn"
                  onClick={() => removeSaved(property.id)}
                  title="Remove from saved"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="saved-card-content">
                <h3 onClick={() => navigate(`/listings/${property.id}`)}>
                  {property.title}
                </h3>
                <p className="saved-card-address">
                  <MapPin size={14} /> {property.address || 'No address specified'}
                </p>
                <p className="saved-card-price">{formatPrice(property.price)}</p>
                <div className="saved-card-meta">
                  {property.bedrooms && <span>{property.bedrooms} bed</span>}
                  {property.bathrooms && <span>{property.bathrooms} bath</span>}
                  <span className="property-type">{property.property_type}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}