// src/pages/dashboards/TenantViewings.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Calendar, Clock, ArrowLeft, MapPin, Search, Eye, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import '../../styles/tenant-viewings.css';

export default function TenantViewings() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [viewings, setViewings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchViewings = async () => {
      try {
        const { data, error } = await supabase
          .from('viewing_requests')
          .select(`
            *,
            listings:listing_id (
              id,
              title,
              address,
              images
            )
          `)
          .eq('buyer_id', profile.id)
          .order('requested_at', { ascending: false });

        if (error) throw error;
        setViewings(data || []);
      } catch (error) {
        console.error('Error fetching viewings:', error);
      } finally {
        setLoading(false);
      }
    };

    if (profile?.id) {
      fetchViewings();
    }
  }, [profile.id]);

  const formatDate = (date) => {
    if (!date) return 'Not scheduled';
    return new Date(date).toLocaleDateString('en-KE', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleTimeString('en-KE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusInfo = (status) => {
    const statuses = {
      pending: { 
        label: 'Pending', 
        class: 'status-pending',
        icon: Clock,
        description: 'Awaiting response from the host'
      },
      confirmed: { 
        label: 'Confirmed', 
        class: 'status-confirmed',
        icon: CheckCircle,
        description: 'Viewing has been confirmed'
      },
      declined: { 
        label: 'Declined', 
        class: 'status-declined',
        icon: XCircle,
        description: 'Viewing request was declined'
      },
      completed: { 
        label: 'Completed', 
        class: 'status-completed',
        icon: Eye,
        description: 'Viewing has been completed'
      }
    };
    return statuses[status] || statuses.pending;
  };

  if (loading) {
    return (
      <div className="viewings-loading">
        <div className="loading-spinner"></div>
        <p>Loading your viewings...</p>
      </div>
    );
  }

  return (
    <div className="viewings-page">
      <button className="back-btn" onClick={() => navigate('/dashboard')}>
        <ArrowLeft size={18} /> Back to Dashboard
      </button>

      <div className="viewings-header">
        <h1><Calendar size={24} /> Viewing Requests</h1>
        <p className="viewings-count">{viewings.length} viewing requests</p>
      </div>

      {viewings.length === 0 ? (
        <div className="viewings-empty">
          <Eye size={48} />
          <h3>No viewing requests yet</h3>
          <p>Schedule a viewing from any property page</p>
          <button className="browse-btn" onClick={() => navigate('/listings')}>
            <Search size={16} /> Browse Properties
          </button>
        </div>
      ) : (
        <div className="viewings-list">
          {viewings.map(viewing => {
            const status = getStatusInfo(viewing.status);
            const StatusIcon = status.icon;
            const hasDateTime = viewing.scheduled_for || viewing.preferred_at;
            
            return (
              <div key={viewing.id} className={`viewings-card ${status.class}`}>
                <div className="viewings-card-left">
                  <img 
                    src={viewing.listings?.images?.[0]?.url || 'https://placehold.co/100x100?text=🏠'} 
                    alt={viewing.listings?.title}
                    onClick={() => navigate(`/listings/${viewing.listing_id}`)}
                    className="viewings-card-image"
                  />
                </div>
                <div className="viewings-card-content">
                  <h3 onClick={() => navigate(`/listings/${viewing.listing_id}`)}>
                    {viewing.listings?.title || 'Property'}
                  </h3>
                  <p className="viewings-card-address">
                    <Search size={16} /> {viewing.listings?.address || 'No address specified'}
                  </p>
                  <div className="viewings-card-details">
                    {hasDateTime && (
                      <>
                        <span className="detail-item">
                          <Calendar size={14} />
                          {formatDate(viewing.scheduled_for || viewing.preferred_at)}
                        </span>
                        {viewing.scheduled_for && (
                          <span className="detail-item">
                            <Clock size={14} />
                            {formatTime(viewing.scheduled_for)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {viewing.message && (
                    <p className="viewings-card-message">
                      "{viewing.message}"
                    </p>
                  )}
                  <div className="viewings-card-status">
                    <StatusIcon size={14} />
                    <span className={`status-badge ${status.class}`}>
                      {status.label}
                    </span>
                    <span className="status-description">{status.description}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}