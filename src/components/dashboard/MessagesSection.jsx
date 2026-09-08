// components/dashboard/MessagesSection.jsx
import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Send, MessageSquarePlus, ArrowLeft, Check, CheckCheck, Plus, FileText, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { getCachedConversations, setCachedConversations, getCachedMessages, setCachedMessages } from './messagingCache';
import '../../styles/messaging-attachments.css';
import PushNotificationBanner from './PushNotificationBanner';
const PAGE_SIZE = 50;
const TYPING_BROADCAST_THROTTLE_MS = 2000;
const TYPING_INDICATOR_TIMEOUT_MS = 3000;
const READ_TICK_COLOR = '#34b7f1';

// NOTE: assumes a Vite env var; swap for however SUPABASE_URL is exposed
// elsewhere in this app (e.g. supabaseClient may already export it).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Kept as an array (not a hardcoded button) so adding "Photo", "Location",
// etc. later is a one-line addition rather than a restructure.
const ATTACH_OPTIONS = [
  { id: 'document', label: 'Document', icon: FileText },
];

const DOCUMENT_TYPES = [
  { value: 'contract', label: 'Contract' },
  { value: 'valuation_certificate', label: 'Valuation certificate' },
  { value: 'survey_report', label: 'Survey report' },
  { value: 'other', label: 'Other' },
];
const DOCUMENT_TYPE_LABELS = DOCUMENT_TYPES.reduce((acc, d) => ({ ...acc, [d.value]: d.label }), {});

const ACCEPTED_FILE_TYPES = '.pdf,.png,.jpg,.jpeg,.doc,.docx';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

function formatMessageTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function previewTextFor(message) {
  if (message.body) return message.body;
  if (message.attachment_file_name) return `📎 ${message.attachment_file_name}`;
  return 'Attachment';
}

export default function MessagesSection() {
  const { profile } = useAuth();

  const location = useLocation(); 

  const cachedConversations = profile?.id ? getCachedConversations(profile.id) : null;
  const [conversations, setConversations] = useState(cachedConversations || []);
  const [loadingConversations, setLoadingConversations] = useState(!cachedConversations);
  const [unreadCounts, setUnreadCounts] = useState({}); // conversationId -> count

  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // --- attachments ---
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingDocType, setPendingDocType] = useState('contract');
  const [pendingListingId, setPendingListingId] = useState('');
  const [listingOptions, setListingOptions] = useState([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const fileInputRef = useRef(null);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const isPrependingRef = useRef(false);
  const prevScrollHeightRef = useRef(0);

  const rowRefs = useRef(new Map());
  const prevRectTopsRef = useRef(new Map());

  const channelRef = useRef(null); // per-open-conversation channel (messages + typing)
  const lastTypingSentAtRef = useRef(0);
  const typingHideTimeoutRef = useRef(null);


  const getBadgeClass = (count) => {
  if (count >= 100) return 'messaging-unread-badge three-digits';
  if (count >= 10) return 'messaging-unread-badge two-digits';
  return 'messaging-unread-badge';
  };

  // Handle navigation state for starting a conversation
  

  // Kept in sync with activeConversation so the *global* subscription below
  // (which only sets up once, not on every conversation switch) can always
  // check "is this incoming message for the chat I'm currently looking at"
  // without needing to be recreated each time.
  const activeConversationIdRef = useRef(null);
  useEffect(() => { activeConversationIdRef.current = activeConversation?.id || null; }, [activeConversation]);

  const fetchConversations = useCallback(async ({ silent = false } = {}) => {
    if (!profile?.id) return;
    if (!silent) setLoadingConversations(true);

    const { data, error } = await supabase
      .schema('marketplace')
      .from('conversations')
      .select(`
        id, listing_id, last_message, last_message_at,
        participant_one, participant_two,
        one:profiles!conversations_participant_one_fkey(id, full_name, avatar_url),
        two:profiles!conversations_participant_two_fkey(id, full_name, avatar_url)
      `)
      .or(`participant_one.eq.${profile.id},participant_two.eq.${profile.id}`)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (!error) {
      const mapped = (data || []).map((c) => ({
        id: c.id,
        listingId: c.listing_id,
        lastMessage: c.last_message,
        lastMessageAt: c.last_message_at,
        otherUser: c.participant_one === profile.id ? c.two : c.one,
      }));
      setConversations(mapped);
      setCachedConversations(profile.id, mapped);

      // Unread badge counts — one query for everything rather than per-row,
      // grouped client-side by conversation_id.
      if (mapped.length > 0) {
        const { data: unreadRows } = await supabase
          .schema('marketplace')
          .from('messages')
          .select('conversation_id')
          .neq('sender_id', profile.id)
          .is('read_at', null)
          .in('conversation_id', mapped.map((c) => c.id));

        const counts = {};
        (unreadRows || []).forEach((r) => {
          counts[r.conversation_id] = (counts[r.conversation_id] || 0) + 1;
        });
        setUnreadCounts(counts);
      }
    }
    setLoadingConversations(false);
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    const cached = getCachedConversations(profile.id);
    if (cached) {
      setConversations(cached);
      setLoadingConversations(false);
      fetchConversations({ silent: true });
    } else {
      fetchConversations();
    }
  }, [profile?.id, fetchConversations]);

  // Shared by both "I just sent a message" and "someone just messaged me
  // in a chat I'm not currently looking at" — moves a conversation to the
  // top of the list and animates it there via FLIP.
  const bumpConversationToTop = useCallback((conversationId, patch) => {
    captureRowPositions();
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === conversationId);
      if (idx === -1) return prev;
      const updated = { ...prev[idx], ...patch };
      const next = [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      if (profile?.id) setCachedConversations(profile.id, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const fetchInitialMessages = useCallback(async (conversationId) => {
    const cached = getCachedMessages(conversationId);
    if (cached) {
      setMessages(cached.messages);
      setHasMoreOlder(cached.hasMoreOlder);
      setLoadingMessages(false);
      return;
    }

    setLoadingMessages(true);
    const { data, error } = await supabase
      .schema('marketplace')
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (!error) {
      const ordered = (data || []).slice().reverse();
      const more = (data || []).length === PAGE_SIZE;
      setMessages(ordered);
      setHasMoreOlder(more);
      setCachedMessages(conversationId, ordered, more);
    }
    setLoadingMessages(false);
  }, []);

  const loadOlderMessages = useCallback(async () => {
    if (!activeConversation?.id || loadingOlder || !hasMoreOlder || messages.length === 0) return;

    const oldest = messages[0].created_at;
    setLoadingOlder(true);

    const container = messagesContainerRef.current;
    prevScrollHeightRef.current = container ? container.scrollHeight : 0;
    isPrependingRef.current = true;

    const { data, error } = await supabase
      .schema('marketplace')
      .from('messages')
      .select('*')
      .eq('conversation_id', activeConversation.id)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (!error) {
      const older = (data || []).slice().reverse();
      setMessages((prev) => {
        const combined = [...older, ...prev];
        setCachedMessages(activeConversation.id, combined, (data || []).length === PAGE_SIZE);
        return combined;
      });
      setHasMoreOlder((data || []).length === PAGE_SIZE);
    }
    setLoadingOlder(false);
  }, [activeConversation?.id, loadingOlder, hasMoreOlder, messages]);


  useEffect(() => {
    const startWithId = location.state?.startConversationWith;
    const listingId = location.state?.listingId;

    if (startWithId && profile?.id && startWithId !== profile.id) {
      // Find or create conversation with this user
      startConversationWithUser(startWithId, listingId);
      // Clear the state to prevent re-running
      window.history.replaceState({}, document.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, location.state]);



   // Add this new function to start a conversation with a specific user
const startConversationWithUser = useCallback(async (otherUserId, listingId = null) => {
  if (!profile?.id || otherUserId === profile.id) return;

  const [a, b] = [profile.id, otherUserId].sort();

  try {
    // First, check if conversation exists more thoroughly
    let query = supabase
      .schema('marketplace')
      .from('conversations')
      .select('id, participant_one, participant_two')
      .eq('participant_one', a)
      .eq('participant_two', b);

    if (listingId) {
      query = query.eq('listing_id', listingId);
    }

    const { data: existing, error: findError } = await query.maybeSingle();

    if (findError && findError.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error finding conversation:', findError);
      return;
    }

    let conversationId = existing?.id;

    // If no conversation exists, try to create one
    if (!conversationId) {
      try {
        const { data: created, error: createError } = await supabase
          .schema('marketplace')
          .from('conversations')
          .insert({ 
            participant_one: a, 
            participant_two: b,
            listing_id: listingId || null 
          })
          .select('id')
          .single();

        if (createError) {
          // If it's a duplicate error (409), try to fetch the existing one again
          if (createError.code === '23505' || createError.status === 409) {
            console.log('Conversation already exists, fetching it...');
            const { data: retryExisting } = await supabase
              .schema('marketplace')
              .from('conversations')
              .select('id')
              .eq('participant_one', a)
              .eq('participant_two', b)
              .maybeSingle();
            
            if (retryExisting) {
              conversationId = retryExisting.id;
            } else {
              console.error('Failed to find existing conversation after duplicate error');
              return;
            }
          } else {
            console.error('Failed to create conversation:', createError);
            return;
          }
        } else {
          conversationId = created.id;
        }
      } catch (err) {
        console.error('Error in conversation creation:', err);
        return;
      }
    }

    if (!conversationId) {
      console.error('No conversation ID available');
      return;
    }

    // Fetch the other user's profile
    const { data: otherUser, error: profileError } = await supabase
      .schema('marketplace')
      .from('profiles')
      .select('id, full_name, avatar_url, role, agency_name')
      .eq('id', otherUserId)
      .single();

    if (profileError) {
      console.error('Failed to fetch user profile:', profileError);
      // Still set the conversation even if we can't get the profile
      setActiveConversation({ 
        id: conversationId, 
        otherUser: { id: otherUserId, full_name: 'User' },
        listingId: listingId || null
      });
    } else {
      setActiveConversation({ 
        id: conversationId, 
        otherUser: otherUser,
        listingId: listingId || null
      });
    }

    // Refresh the conversations list
    await fetchConversations();
    
  } catch (error) {
    console.error('Unexpected error in startConversationWithUser:', error);
  }
}, [profile?.id, fetchConversations]);





  useEffect(() => {
    if (!isPrependingRef.current) return;
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight - prevScrollHeightRef.current;
    }
    isPrependingRef.current = false;
  }, [messages]);

  function handleMessagesScroll(e) {
    if (e.target.scrollTop < 80) {
      loadOlderMessages();
    }
  }

  const markMessagesAsRead = useCallback(async (conversationId) => {
  if (!conversationId || !profile?.id) return;
  
  try {
    const { error } = await supabase
      .schema('marketplace')
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', profile.id)
      .is('read_at', null);
    
    if (error) {
      console.error('Failed to mark messages as read:', error);
      return;
    }
    
    // Update local state to remove unread count for this conversation
    setUnreadCounts(prev => ({
      ...prev,
      [conversationId]: 0
    }));
    
    // Also update the conversations list
    setConversations(prev => {
      const updated = prev.map(c => 
        c.id === conversationId 
          ? { ...c, unreadCount: 0, lastMessage: c.lastMessage } 
          : c
      );
      if (profile?.id) setCachedConversations(profile.id, updated);
      return updated;
    });
    
    // Force refresh the badge count
    fetchConversations({ silent: true });
    
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }, [profile?.id, fetchConversations]);



  const handleConversationClick = useCallback((conversation) => {
  setActiveConversation({ 
    id: conversation.id, 
    otherUser: conversation.otherUser, 
    listingId: conversation.listingId 
  });
  
  // Immediately mark messages as read
  if (conversation.id) {
    markMessagesAsRead(conversation.id);
  }
  }, [markMessagesAsRead]);


  function captureRowPositions() {
    const map = new Map();
    rowRefs.current.forEach((el, id) => {
      if (el) map.set(id, el.getBoundingClientRect().top);
    });
    prevRectTopsRef.current = map;
  }

  useLayoutEffect(() => {
    const prevTops = prevRectTopsRef.current;
    if (prevTops.size === 0) return;

    rowRefs.current.forEach((el, id) => {
      if (!el) return;
      const prevTop = prevTops.get(id);
      if (prevTop == null) return;
      const newTop = el.getBoundingClientRect().top;
      const delta = prevTop - newTop;
      if (delta) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${delta}px)`;
        // eslint-disable-next-line no-unused-expressions
        el.offsetHeight;
        el.style.transition = 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.transform = '';
      }
    });

    prevRectTopsRef.current = new Map();
  }, [conversations]);



  // Per-open-conversation channel: live message updates + typing broadcast
  // for whichever chat is currently on screen.
  useEffect(() => {
    if (!activeConversation?.id) return;

    const cached = getCachedMessages(activeConversation.id);
    setMessages(cached?.messages || []);
    setHasMoreOlder(cached?.hasMoreOlder || false);
    setOtherTyping(false);

    // Opening a chat clears its badge immediately (optimistic — the actual
    // DB update happens via markMessagesAsRead right after).
    setUnreadCounts((prev) => ({ ...prev, [activeConversation.id]: 0 }));

    fetchInitialMessages(activeConversation.id).then(() => {
      markMessagesAsRead(activeConversation.id);
    });

    const channel = supabase
      .channel(`messages-${activeConversation.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'marketplace', table: 'messages', filter: `conversation_id=eq.${activeConversation.id}` },
        (payload) => {
          setMessages((prev) => {
            const next = [...prev, payload.new];
            setCachedMessages(activeConversation.id, next, hasMoreOlder);
            return next;
          });
          if (payload.new.sender_id !== profile.id) {
            markMessagesAsRead(activeConversation.id);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'marketplace', table: 'messages', filter: `conversation_id=eq.${activeConversation.id}` },
        (payload) => {
          setMessages((prev) => {
            const next = prev.map((m) => (m.id === payload.new.id ? payload.new : m));
            setCachedMessages(activeConversation.id, next, hasMoreOlder);
            return next;
          });
        }
      )
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.userId === profile.id) return;
        setOtherTyping(true);
        clearTimeout(typingHideTimeoutRef.current);
        typingHideTimeoutRef.current = setTimeout(() => setOtherTyping(false), TYPING_INDICATOR_TIMEOUT_MS);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      clearTimeout(typingHideTimeoutRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversation?.id, fetchInitialMessages, markMessagesAsRead]);

  // Global channel: stays alive for as long as this component is mounted,
  // independent of which (if any) conversation is open. This is what makes
  // the badge + "float to top" work for chats you're NOT currently viewing
  // — the per-conversation channel above only exists while that one chat
  // is open, so it can't tell you about messages elsewhere.
  useEffect(() => {
    if (!profile?.id) return;

    const globalChannel = supabase
      .channel(`global-messages-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'marketplace', table: 'messages' },
        (payload) => {
          const message = payload.new;
          if (message.sender_id === profile.id) return; // ignore our own sends

          const isCurrentlyOpen = message.conversation_id === activeConversationIdRef.current;
          if (isCurrentlyOpen) return; // the per-conversation channel already handles this one

          setUnreadCounts((prev) => ({
            ...prev,
            [message.conversation_id]: (prev[message.conversation_id] || 0) + 1,
          }));

          bumpConversationToTop(message.conversation_id, {
            lastMessage: previewTextFor(message),
            lastMessageAt: message.created_at,
          });

          // Keep that conversation's cached messages in sync too, not just
          // the sidebar preview — otherwise opening it later shows whatever
          // was cached from your last visit, missing anything that arrived
          // while you were looking at a different chat.
          const existingCache = getCachedMessages(message.conversation_id);
          if (existingCache) {
            setCachedMessages(
              message.conversation_id,
              [...existingCache.messages, message],
              existingCache.hasMoreOlder
            );
          }
          // No existing cache entry means this conversation has never been
          // opened this session — fetchInitialMessages will do a real fetch
          // the first time it's opened, which is already correct as-is.
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(globalChannel); };
  }, [profile?.id, bumpConversationToTop]);

  useEffect(() => {
    if (isPrependingRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Populate the listing picker for the document modal — scoped to
  // whichever participant in this chat is the agent, since a listing only
  // makes sense as "the property the contract/valuation/survey is about."
  useEffect(() => {
    if (!documentModalOpen || !activeConversation) return;
    const agentId = profile.role === 'agent' ? profile.id : activeConversation.otherUser?.id;
    if (!agentId) { setListingOptions([]); return; }

    supabase
      .schema('marketplace')
      .from('listings')
      .select('id, title')
      .eq('agent_id', agentId)
      .then(({ data, error }) => {
        if (!error) setListingOptions(data || []);
      });
  }, [documentModalOpen, activeConversation, profile?.role, profile?.id]);


  function handleDraftChange(value) {
    setDraft(value);
    if (!channelRef.current || !value.trim()) return;

    const now = Date.now();
    if (now - lastTypingSentAtRef.current < TYPING_BROADCAST_THROTTLE_MS) return;
    lastTypingSentAtRef.current = now;

    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: profile.id },
    });
  }

  async function handleSend(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !activeConversation?.id || sending) return;

    setSending(true);
    setDraft('');

    const { error } = await supabase
      .schema('marketplace')
      .from('messages')
      .insert({ conversation_id: activeConversation.id, sender_id: profile.id, body });

    setSending(false);
    if (error) {
      console.error('Failed to send message:', error);
      setDraft(body);
      return;
    }

    // Fire-and-forget: don't let a push failure block the send flow.
    supabase.functions.invoke('send-push', {
      body: {
        user_id: activeConversation.otherUser?.id,
        title: profile.full_name ? `New message from ${profile.full_name}` : 'New message',
        body,
        url: '/dashboard/messages',
      },
    }).catch((err) => console.error('Push notification failed:', err));

    bumpConversationToTop(activeConversation.id, {
      lastMessage: body,
      lastMessageAt: new Date().toISOString(),
    });
  }

  async function handleSearch(query) {
    setSearchQuery(query);
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const { data, error } = await supabase
      .schema('marketplace')
      .from('profiles')
      .select('id, full_name, avatar_url, role, agency_name')
      .neq('id', profile.id)
      .ilike('full_name', `%${query.trim()}%`)
      .limit(15);

    if (!error) setSearchResults(data || []);
    setSearching(false);
  }

  async function startConversation(otherUser) {
    const [a, b] = [profile.id, otherUser.id].sort();

    const { data: existing } = await supabase
      .schema('marketplace')
      .from('conversations')
      .select('id')
      .eq('participant_one', a)
      .eq('participant_two', b)
      .maybeSingle();

    let conversationId = existing?.id;

    if (!conversationId) {
      const { data: created, error } = await supabase
        .schema('marketplace')
        .from('conversations')
        .insert({ participant_one: a, participant_two: b })
        .select('id')
        .single();
      if (error) { console.error(error); return; }
      conversationId = created.id;
    }

    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setActiveConversation({ id: conversationId, otherUser });
    fetchConversations();
  }

  // --- attachments ---

  function handleAttachOptionSelect(optionId) {
    setAttachMenuOpen(false);
    if (optionId === 'document') setDocumentModalOpen(true);
  }

  function handleFilePicked(e) {
    const file = e.target.files?.[0];
    if (file) setPendingFile(file);
  }

  function closeDocumentModal() {
    setDocumentModalOpen(false);
    setPendingFile(null);
    setPendingDocType('contract');
    setPendingListingId('');
    setAttachmentError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleAttachmentSend() {
    if (!pendingFile || !activeConversation?.id || uploadingAttachment) return;
    setUploadingAttachment(true);
    setAttachmentError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('conversation_id', activeConversation.id);
      formData.append('document_type', pendingDocType);
      if (pendingListingId) formData.append('listing_id', pendingListingId);

      const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-message-attachment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: formData,
      });
      const result = await res.json();

      if (!res.ok) {
        setAttachmentError(result.error || 'Upload failed. Please try again.');
        setUploadingAttachment(false);
        return;
      }

      // The edge function inserts the message row server-side; the
      // per-conversation postgres_changes INSERT listener above will pick
      // it up and append it to `messages` the same way a normal send does
      // — we only need to update the sidebar preview here.
      bumpConversationToTop(activeConversation.id, {
        lastMessage: previewTextFor(result),
        lastMessageAt: result.created_at,
      });

      closeDocumentModal();
    } catch (err) {
      console.error('Attachment upload failed:', err);
      setAttachmentError('Upload failed. Please try again.');
    }
    setUploadingAttachment(false);
  }

  async function handleViewAttachment(message) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-attachment-url?message_id=${message.id}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const result = await res.json();

      if (!res.ok) {
        console.error('Failed to get attachment URL:', result.error);
        return;
      }
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to open attachment:', err);
    }
  }

  return (
    <div className="messaging-shell-wrapper">
      <PushNotificationBanner userId={profile?.id} />
      <div className="messaging-shell">
      <div className={`messaging-list-pane ${activeConversation ? 'messaging-list-pane--hidden-mobile' : ''}`}>
        <div className="messaging-list-header">
          <p className="messaging-list-title">Chats</p>
          <button type="button" className="messaging-new-btn" onClick={() => setSearchOpen(true)} aria-label="New chat">
            <MessageSquarePlus size={18} />
          </button>
        </div>

        <div className="messaging-conversations">
          {loadingConversations ? (
            <p className="agent-picker-empty">Loading chats…</p>
          ) : conversations.length === 0 ? (
            <p className="agent-picker-empty">No conversations yet. Start one with the + button above.</p>
          ) : (
            conversations.map((c) => {
              const unread = unreadCounts[c.id] || 0;
              return (
                <button
                  type="button"
                  key={c.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(c.id, el);
                    else rowRefs.current.delete(c.id);
                  }}
                  className={`messaging-conversation-row ${activeConversation?.id === c.id ? 'messaging-conversation-row--active' : ''}`}
                  onClick={() => setActiveConversation({ id: c.id, otherUser: c.otherUser, listingId: c.listingId })}
                >
                  <img
                    className="messaging-avatar"
                    src={c.otherUser?.avatar_url || 'https://placehold.co/48x48?text=%20'}
                    alt=""
                  />
                  <div className="messaging-conversation-text">
                    <p className={`messaging-conversation-name ${unread > 0 ? 'messaging-conversation-name--unread' : ''}`}>
                      {c.otherUser?.full_name || 'User'}
                    </p>
                    <p className={`messaging-conversation-preview ${unread > 0 ? 'messaging-conversation-preview--unread' : ''}`}>
                      {c.lastMessage || 'Say hello…'}
                    </p>
                  </div>
                  <div className="messaging-conversation-side">
                    {c.lastMessageAt && (
                      <span className="messaging-conversation-time">{timeAgo(c.lastMessageAt)}</span>
                    )}
                    {unread > 0 && (
                      <span className={getBadgeClass(unread)}>
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className={`messaging-chat-pane ${activeConversation ? '' : 'messaging-chat-pane--hidden-mobile'}`}>
        {!activeConversation ? (
          <div className="messaging-empty-state">
            <MessageSquarePlus size={32} />
            <p>Select a chat, or start a new one.</p>
          </div>
        ) : (
          <>
            <div className="messaging-chat-header">
              <button
                type="button"
                className="messaging-back-btn"
                onClick={() => setActiveConversation(null)}
                aria-label="Back to chats"
              >
                <ArrowLeft size={18} />
              </button>
              <img
                className="messaging-avatar"
                src={activeConversation.otherUser?.avatar_url || 'https://placehold.co/48x48?text=%20'}
                alt=""
              />
              <div>
                <p className="messaging-chat-header-name">{activeConversation.otherUser?.full_name || 'User'}</p>
                {otherTyping && <p className="messaging-typing-indicator">typing…</p>}
              </div>
            </div>

            <div className="messaging-messages" ref={messagesContainerRef} onScroll={handleMessagesScroll}>
              {loadingOlder && <p className="agent-picker-empty">Loading earlier messages…</p>}

              {loadingMessages ? (
                <p className="agent-picker-empty">Loading messages…</p>
              ) : messages.length === 0 ? (
                <p className="agent-picker-empty">No messages yet — say hello.</p>
              ) : (
                messages.map((m) => {
                  const mine = m.sender_id === profile.id;
                  return (
                    <div key={m.id} className={`messaging-bubble-row ${mine ? 'messaging-bubble-row--mine' : ''}`}>
                      <div className={`messaging-bubble ${mine ? 'messaging-bubble--mine' : ''}`}>
                        {m.attachment_storage_path ? (
                          <button
                            type="button"
                            className="messaging-attachment-card"
                            onClick={() => handleViewAttachment(m)}
                          >
                            <FileText size={20} />
                            <div className="messaging-attachment-info">
                              <span className="messaging-attachment-name">{m.attachment_file_name}</span>
                              <span className="messaging-attachment-type">
                                {DOCUMENT_TYPE_LABELS[m.attachment_document_type] || 'Document'}
                              </span>
                            </div>
                          </button>
                        ) : (
                          <p className="messaging-bubble-text">{m.body}</p>
                        )}
                        <span className="messaging-bubble-time">
                          {formatMessageTime(m.created_at)}
                          {mine && (
                            m.read_at
                              ? <CheckCheck size={13} color={READ_TICK_COLOR} />
                              : <Check size={13} />
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <form className="messaging-input-row" onSubmit={handleSend}>
              <div className="messaging-attach-wrapper">
                <button
                  type="button"
                  className="messaging-attach-btn"
                  onClick={() => setAttachMenuOpen((o) => !o)}
                  aria-label="Attach"
                >
                  <Plus size={18} />
                </button>
                {attachMenuOpen && (
                  <div className="messaging-attach-menu">
                    {ATTACH_OPTIONS.map((opt) => (
                      <button
                        type="button"
                        key={opt.id}
                        className="messaging-attach-menu-item"
                        onClick={() => handleAttachOptionSelect(opt.id)}
                      >
                        <opt.icon size={16} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="text"
                placeholder="Type a message…"
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
              />
              <button type="submit" disabled={!draft.trim() || sending} aria-label="Send">
                <Send size={17} />
              </button>
            </form>
          </>
        )}
      </div>

      {searchOpen && (
        <div className="messaging-search-overlay" onClick={() => setSearchOpen(false)}>
          <div className="messaging-search-modal" onClick={(e) => e.stopPropagation()}>
            <div className="messaging-search-header">
              <Search size={16} />
              <input
                autoFocus
                type="text"
                placeholder="Search people by name…"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            <div className="messaging-search-results">
              {searching ? (
                <p className="agent-picker-empty">Searching…</p>
              ) : searchQuery && searchResults.length === 0 ? (
                <p className="agent-picker-empty">No one found.</p>
              ) : (
                searchResults.map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    className="messaging-search-result-row"
                    onClick={() => startConversation(u)}
                  >
                    <img
                      className="messaging-avatar"
                      src={u.avatar_url || 'https://placehold.co/48x48?text=%20'}
                      alt=""
                    />
                    <div className="messaging-conversation-text">
                      <p className="messaging-conversation-name">{u.full_name}</p>
                      <p className="messaging-conversation-preview">
                        {u.agency_name || u.role}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {documentModalOpen && (
        <div className="messaging-search-overlay" onClick={closeDocumentModal}>
          <div className="messaging-search-modal" onClick={(e) => e.stopPropagation()}>
            <div className="messaging-search-header">
              <FileText size={16} />
              <p className="messaging-attach-modal-title">Send a document</p>
              <button type="button" className="messaging-attach-close" onClick={closeDocumentModal} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="messaging-attach-form">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                onChange={handleFilePicked}
              />
              {pendingFile && <p className="messaging-attach-filename">{pendingFile.name}</p>}

              <label className="messaging-attach-label">
                Document type
                <select value={pendingDocType} onChange={(e) => setPendingDocType(e.target.value)}>
                  {DOCUMENT_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </label>

              <label className="messaging-attach-label">
                Related listing (optional)
                <select value={pendingListingId} onChange={(e) => setPendingListingId(e.target.value)}>
                  <option value="">None</option>
                  {listingOptions.map((l) => (
                    <option key={l.id} value={l.id}>{l.title}</option>
                  ))}
                </select>
              </label>

              {attachmentError && <p className="messaging-attach-error">{attachmentError}</p>}

              <button
                type="button"
                className="messaging-attach-submit"
                disabled={!pendingFile || uploadingAttachment}
                onClick={handleAttachmentSend}
              >
                {uploadingAttachment ? 'Sending…' : 'Send document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}