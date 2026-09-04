// src/pages/dashboards/TenantDashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
  Home,
  Heart,
  Search,
  User,
  Bell,
  Settings,
  LogOut,
  MapPin,
  Calendar,
  Clock,
  TrendingUp,
  Building2,
  Star,
  ChevronRight,
  Eye,
  Phone,
  Mail,
  FileText,
  MessageCircle,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import '../../styles/tenant-dashboard.css';

export default function TenantDashboard() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  
  const [savedProperties, setSavedProperties] = useState([]);
  const [recentViews, setRecentViews] = useState([]);
  const [activeInquiries, setActiveInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingRequests, setViewingRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      
      try {
        // 1. Get saved properties (favorites)
        const { data: favorites } = await supabase
          .schema('marketplace')
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

        setSavedProperties(favorites?.map(f => f.listings) || []);

        // 2. Get recent property views
        const { data: views } = await supabase
          .schema('marketplace')
          .from('property_views')
          .select(`
            listing_id,
            viewed_at,
            listings:listing_id (
              id,
              title,
              price,
              address,
              images,
              property_type
            )
          `)
          .eq('user_id', profile.id)
          .order('viewed_at', { ascending: false })
          .limit(5);

        setRecentViews(views?.map(v => ({ ...v.listings, viewed_at: v.viewed_at })) || []);

        // 3. Get active inquiries
        const { data: inquiries } = await supabase
          .schema('marketplace')
          .from('conversations')
          .select(`
            id,
            listing_id,
            last_message,
            last_message_at,
            listings:listing_id (
              id,
              title,
              price,
              address,
              images
            ),
            participant_one,
            participant_two,
            one:profiles!conversations_participant_one_fkey (
              id,
              full_name,
              avatar_url,
              role
            ),
            two:profiles!conversations_participant_two_fkey (
              id,
              full_name,
              avatar_url,
              role
            )
          `)
          .or(`participant_one.eq.${profile.id},participant_two.eq.${profile.id}`)
          .not('listing_id', 'is', null)
          .order('last_message_at', { ascending: false })
          .limit(5);

        setActiveInquiries(inquiries || []);

        // 4. Get viewing requests
        const { data: viewings } = await supabase
          .schema('marketplace')
          .from('viewing_requests')
          .select(`
            id,
            listing_id,
            status,
            preferred_at,
            scheduled_for,
            message,
            listings:listing_id (
              id,
              title,
              address,
              images
            )
          `)
          .eq('buyer_id', profile.id)
          .order('requested_at', { ascending: false })
          .limit(5);

        setViewingRequests(viewings || []);

        // 5. Get notifications
        const { data: notifs } = await supabase
          .schema('marketplace')
          .from('notifications')
          .select('*')
          .eq('user_id', profile.id)
          .is('read_at', null)
          .order('created_at', { ascending: false })
          .limit(10);

        setNotifications(notifs || []);

      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (profile?.id) {
      fetchDashboardData();
    }
  }, [profile]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const formatPrice = (price) => {
    return `KES ${parseFloat(price || 0).toLocaleString()}`;
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-KE', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const timeAgo = (dateStr) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return formatDate(dateStr);
  };

  if (loading) {
    return (
      <div className="tenant-dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="tenant-dashboard">
    {/* Sidebar - Now Brown with White Text */}
    <aside className="tenant-sidebar">
      <div 
        className="sidebar-brand"
        onClick={() => navigate('/welcome')}
        style={{ cursor: 'pointer' }}
      >
        <Building2 size={28} />
        <span>MarketPlace</span>
      </div>

      <div className="sidebar-profile">
        <img 
          src={profile?.avatar_url || 'https://placehold.co/64x64?text=👤'} 
          alt={profile?.full_name}
          className="sidebar-avatar"
        />
        <div className="sidebar-profile-info">
          <p className="sidebar-profile-name">{profile?.full_name || 'Tenant'}</p>
          <p className="sidebar-profile-role">Tenant</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button 
          className="sidebar-nav-item active"
          onClick={() => navigate('/dashboard')}
        >
          <Home size={20} />
          <span>Dashboard</span>
        </button>
        <button 
          className="sidebar-nav-item"
          onClick={() => navigate('/listings')}
        >
          <Search size={20} />
          <span>Find Properties</span>
        </button>
        <button 
          className="sidebar-nav-item"
          onClick={() => navigate('/dashboard/saved')}
        >
          <Heart size={20} />
          <span>Saved Properties</span>
          {savedProperties.length > 0 && (
            <span className="sidebar-badge">{savedProperties.length}</span>
          )}
        </button>
        
        <button 
          className="sidebar-nav-item"
          onClick={() => navigate('/dashboard/messages')}
        >
          <MessageCircle size={20} />
          <span>Inquiries</span>
          {activeInquiries.length > 0 && (
            <span className="sidebar-badge">{activeInquiries.length}</span>
          )}
        </button>

        <button 
          className="sidebar-nav-item"
          onClick={() => navigate('/dashboard/viewings')}
        >
          <Calendar size={20} />
          <span>Viewings</span>
          {viewingRequests.filter(v => v.status === 'pending').length > 0 && (
            <span className="sidebar-badge">
              {viewingRequests.filter(v => v.status === 'pending').length}
            </span>
          )}
        </button>
        <button 
          className="sidebar-nav-item"
          onClick={() => navigate('/dashboard/profile')}
        >
          <User size={20} />
          <span>Profile</span>
        </button>
        <button 
          className="sidebar-nav-item"
          onClick={() => navigate('/dashboard/settings')}
        >
          <Settings size={20} />
          <span>Settings</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <button 
          className="sidebar-nav-item logout"
          onClick={handleSignOut}
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </aside>

      {/* Main Content */}
      <main className="tenant-main">
        {/* Header */}
        <header className="tenant-header">
          <div className="header-left">
            <h1>Dashboard</h1>
            <p className="header-subtitle">
              Welcome back, {profile?.full_name?.split(' ')[0] || 'Tenant'}! 
              {savedProperties.length === 0 && " Let's find you the perfect home."}
            </p>
          </div>
          <div className="header-right">
            <button 
              className="header-notification-btn"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell size={20} />
              {notifications.length > 0 && (
                <span className="notification-dot">{notifications.length}</span>
              )}
            </button>
            <button 
              className="header-avatar-btn"
              onClick={() => navigate('/dashboard/profile')}
            >
              <img 
                src={profile?.avatar_url || 'https://placehold.co/36x36?text=👤'} 
                alt={profile?.full_name}
              />
            </button>
          </div>
        </header>

        {/* Quick Stats */}
        <div className="tenant-stats">
          <div className="stat-card">
            <div className="stat-icon saved">
              <Heart size={20} />
            </div>
            <div className="stat-info">
              <p className="stat-value">{savedProperties.length}</p>
              <p className="stat-label">Saved Properties</p>
            </div>
          </div>



          <div className="stat-card">
            <div className="stat-icon inquiries">
              <MessageCircle size={20} />
            </div>
            <div className="stat-info">
              <p className="stat-value">{activeInquiries.length}</p>
              <p className="stat-label">Active Inquiries</p>
            </div>
          </div>


          <div className="stat-card">
            <div className="stat-icon viewings">
              <Calendar size={20} />
            </div>
            <div className="stat-info">
              <p className="stat-value">{viewingRequests.length}</p>
              <p className="stat-label">Viewings</p>
              {viewingRequests.filter(v => v.status === 'pending').length > 0 && (
                <span className="stat-badge pending">
                  {viewingRequests.filter(v => v.status === 'pending').length} pending
                </span>
              )}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon recent">
              <Eye size={20} />
            </div>
            <div className="stat-info">
              <p className="stat-value">{recentViews.length}</p>
              <p className="stat-label">Recent Views</p>
            </div>
          </div>
        </div>

        {/* Recent Activity & Saved Properties */}
        <div className="tenant-grid">
          {/* Saved Properties */}
          <section className="tenant-section saved-properties">
            <div className="section-header">
              <h2>
                <Heart size={18} />
                Saved Properties
              </h2>
              {savedProperties.length > 0 && (
                <button 
                  className="view-all-btn"
                  onClick={() => navigate('/dashboard/saved')}
                >
                  View All <ChevronRight size={16} />
                </button>
              )}
            </div>
            
            {savedProperties.length === 0 ? (
              <div className="empty-state">
                <Heart size={48} />
                <p>No saved properties yet</p>
                <button 
                  className="browse-btn"
                  onClick={() => navigate('/listings')}
                >
                  <Search size={16} /> Browse Properties
                </button>
              </div>
            ) : (
              <div className="property-grid">
                {savedProperties.slice(0, 4).map(property => (
                  <div 
                    key={property.id} 
                    className="property-card"
                    onClick={() => navigate(`/listings/${property.id}`)}
                  >
                    <div className="property-image">
                      <img 
                        src={property.images?.[0]?.url || 'https://placehold.co/300x200?text=No+Image'} 
                        alt={property.title}
                      />
                      <button className="property-save-btn saved">
                        <Heart size={16} fill="#5a1a20" />
                      </button>
                    </div>
                    <div className="property-details">
                      <h3>{property.title}</h3>
                      <p className="property-address">
                        <MapPin size={12} /> {property.address || 'Location not specified'}
                      </p>
                      <p className="property-price">{formatPrice(property.price)}</p>
                      <div className="property-meta">
                        {property.bedrooms && (
                          <span>{property.bedrooms} bed</span>
                        )}
                        {property.bathrooms && (
                          <span>{property.bathrooms} bath</span>
                        )}
                        <span className="property-type">{property.property_type}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent Views */}
          <section className="tenant-section recent-views">
            <div className="section-header">
              <h2>
                <Eye size={18} />
                Recent Views
              </h2>
            </div>
            
            {recentViews.length === 0 ? (
              <div className="empty-state small">
                <p>Start exploring properties</p>
                <button 
                  className="browse-btn small"
                  onClick={() => navigate('/listings')}
                >
                  Browse Now
                </button>
              </div>
            ) : (
              <div className="recent-views-list">
                {recentViews.map((view, index) => (
                  <div 
                    key={index} 
                    className="recent-view-item"
                    onClick={() => navigate(`/listings/${view.id}`)}
                  >
                    <div className="recent-view-image">
                      <img 
                        src={view.images?.[0]?.url || 'https://placehold.co/60x60?text=🏠'} 
                        alt={view.title}
                      />
                    </div>
                    <div className="recent-view-details">
                      <h4>{view.title}</h4>
                      <p>{formatPrice(view.price)}</p>
                      <span className="recent-view-time">
                        Viewed {timeAgo(view.viewed_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Active Inquiries & Viewing Requests */}
        <div className="tenant-grid bottom">
          {/* Active Inquiries */}
          <section className="tenant-section active-inquiries">
            <div className="section-header">
              <h2>
                <MessageCircle size={18} />
                Active Inquiries
              </h2>
              {activeInquiries.length > 0 && (
                <button 
                  className="view-all-btn"
                  onClick={() => navigate('/dashboard/messages')}
                >
                  View All <ChevronRight size={16} />
                </button>
              )}
            </div>
            
            {activeInquiries.length === 0 ? (
              <div className="empty-state small">
                <p>No active inquiries</p>
                <button 
                  className="browse-btn small"
                  onClick={() => navigate('/listings')}
                >
                  Find Properties
                </button>
              </div>
            ) : (
              <div className="inquiry-list">
                {activeInquiries.slice(0, 3).map(inquiry => {
                  const otherUser = inquiry.participant_one === profile.id 
                    ? inquiry.two 
                    : inquiry.one;
                  return (
                    <div 
                      key={inquiry.id} 
                      className="inquiry-item"
                      onClick={() => navigate('/dashboard/messages')}
                    >
                      <img 
                        src={otherUser?.avatar_url || 'https://placehold.co/40x40'} 
                        alt={otherUser?.full_name}
                        className="inquiry-avatar"
                      />
                      <div className="inquiry-details">
                        <div className="inquiry-header">
                          <span className="inquiry-name">
                            {otherUser?.full_name || 'Agent'}
                            {otherUser?.role === 'agent' && (
                              <span className="agent-badge">Agent</span>
                            )}
                          </span>
                          <span className="inquiry-time">
                            {timeAgo(inquiry.last_message_at)}
                          </span>
                        </div>
                        <p className="inquiry-property">{inquiry.listings?.title}</p>
                        <p className="inquiry-last-message">
                          {inquiry.last_message || 'No messages yet'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Viewing Requests */}
          <section className="tenant-section viewing-requests">
            <div className="section-header">
              <h2>
                <Calendar size={18} />
                Viewing Requests
              </h2>
              {viewingRequests.length > 0 && (
                <button 
                  className="view-all-btn"
                  onClick={() => navigate('/dashboard/viewings')}
                >
                  View All <ChevronRight size={16} />
                </button>
              )}
            </div>
            
            {viewingRequests.length === 0 ? (
              <div className="empty-state small">
                <p>No viewing requests</p>
              </div>
            ) : (
              <div className="viewing-list">
                {viewingRequests.slice(0, 3).map(request => (
                  <div 
                    key={request.id} 
                    className={`viewing-item status-${request.status}`}
                    onClick={() => navigate(`/listings/${request.listing_id}`)}
                  >
                    <div className="viewing-status-icon">
                      {request.status === 'pending' && <Clock size={16} />}
                      {request.status === 'confirmed' && <CheckCircle size={16} color="#3f6b54" />}
                      {request.status === 'declined' && <XCircle size={16} color="#b5482f" />}
                    </div>
                    <div className="viewing-details">
                      <p className="viewing-property">
                        {request.listings?.title || 'Property'}
                      </p>
                      <p className="viewing-date">
                        {request.scheduled_for 
                          ? `Scheduled: ${formatDate(request.scheduled_for)}`
                          : `Requested: ${formatDate(request.preferred_at)}`
                        }
                      </p>
                      <span className={`viewing-status status-${request.status}`}>
                        {request.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Notifications Dropdown */}
        {showNotifications && (
          <div className="notifications-dropdown" onClick={() => setShowNotifications(false)}>
            <div className="notifications-content" onClick={e => e.stopPropagation()}>
              <div className="notifications-header">
                <h4>Notifications</h4>
                {notifications.length > 0 && (
                  <button className="mark-all-read">Mark all read</button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="no-notifications">
                  <Bell size={32} />
                  <p>No new notifications</p>
                </div>
              ) : (
                <div className="notifications-list">
                  {notifications.map(notif => (
                    <div key={notif.id} className="notification-item">
                      <div className="notification-icon">
                        {notif.type === 'viewing' && <Calendar size={16} />}
                        {notif.type === 'message' && <MessageCircle size={16} />}
                        {notif.type === 'offer' && <Home size={16} />}
                      </div>
                      <div className="notification-details">
                        <p>{notif.message}</p>
                        <span className="notification-time">
                          {timeAgo(notif.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}