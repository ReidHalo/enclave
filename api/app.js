// 1. Initialize Supabase
const supabase = window.supabase.createClient('https://aflbmhfwywugdcmwmdpa.supabase.co/rest/v1/', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmbGJtaGZ3eXd1Z2RjbXdtZHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MTQyMTgsImV4cCI6MjEwMzE5MDIxOH0.iS5jxIB5yeaCHsqLBVzfxBFo5zPI6yCAsYjuL8SvTmM');

// 2. Auth DOM Elements
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const usernameInput = document.getElementById('username-input');
const avatarInput = document.getElementById('avatar-input');
const authError = document.getElementById('auth-error');
const toggleAuthBtn = document.getElementById('toggle-auth-btn');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

let isLoginMode = true;

// Toggle Login / Register UI
toggleAuthBtn.addEventListener('click', () => {
  isLoginMode = !isLoginMode;
  if (isLoginMode) {
    loginBtn.textContent = 'Initialize Connection';
    toggleAuthBtn.textContent = 'New Agent? Register Here';
    usernameInput.style.display = 'none';
    avatarInput.style.display = 'none';
    usernameInput.required = false;
  } else {
    loginBtn.textContent = 'Register Profile';
    toggleAuthBtn.textContent = 'Return to Login';
    usernameInput.style.display = 'block';
    avatarInput.style.display = 'block';
    usernameInput.required = true;
  }
  authError.textContent = '';
});

// Handle Login / Register Submit
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  
  if (isLoginMode) {
    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput.value,
      password: passwordInput.value
    });
    if (error) authError.textContent = error.message;
    else checkUser();
  } else {
    const { data, error } = await supabase.auth.signUp({
      email: emailInput.value,
      password: passwordInput.value
    });
    
    if (error) {
      authError.textContent = error.message;
    } else if (data.user) {
      // Save profile to database
      await supabase.from('profiles').insert([{
        id: data.user.id,
        username: usernameInput.value,
        avatar_url: avatarInput.value || 'https://i.imgur.com/34iP6Xn.png'
      }]);
      alert("Registration complete. You may now log in.");
      toggleAuthBtn.click();
    }
  }
});

// Check Session & Switch Screens
async function checkUser() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    authScreen.style.display = 'none';
    appContainer.style.display = 'flex';
    initChat(session.user);
  } else {
    authScreen.style.display = 'flex';
    appContainer.style.display = 'none';
  }
}

// Handle Logout
logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  checkUser();
});

// --- CHAT LOGIC ---
let currentChannelId = null;
let currentUserProfile = null;
const messagesContainer = document.getElementById('messages-container');
const chatForm = document.getElementById('chat-form');
const msgInput = document.getElementById('msg-input');

async function initChat(user) {
  // Fetch user profile
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  currentUserProfile = profile;
  document.getElementById('my-username').textContent = profile.username;
  document.getElementById('my-avatar').src = profile.avatar_url;

  // Auto-create/join Global Server
  let { data: servers } = await supabase.from('servers').select('*').limit(1);
  if (!servers || servers.length === 0) {
    const { data: newServer } = await supabase.from('servers').insert([{ name: 'Global Hub', owner_id: user.id }]).select();
    servers = newServer;
  }
  
  let { data: channels } = await supabase.from('channels').select('*').eq('server_id', servers[0].id).limit(1);
  if (!channels || channels.length === 0) {
    const { data: newChannel } = await supabase.from('channels').insert([{ name: 'general-comms', server_id: servers[0].id }]).select();
    channels = newChannel;
  }
  
  currentChannelId = channels[0].id;
  loadMessages();

  // Listen for Realtime Messages
  supabase.channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
      if (payload.new.channel_id === currentChannelId) {
        const { data: sender } = await supabase.from('profiles').select('*').eq('id', payload.new.user_id).single();
        renderMessage(sender.username, sender.avatar_url, payload.new.content, payload.new.created_at);
      }
    }).subscribe();
}

async function loadMessages() {
  const { data: messages } = await supabase
    .from('messages')
    .select('*, profiles(username, avatar_url)')
    .eq('channel_id', currentChannelId)
    .order('created_at', { ascending: true });

  messagesContainer.innerHTML = '';
  if (messages) {
    messages.forEach(msg => renderMessage(msg.profiles.username, msg.profiles.avatar_url, msg.content, msg.created_at));
  }
}

function renderMessage(username, avatarUrl, text, timestamp) {
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message';
  
  // Security: Prevent XSS attacks in chat messages
  const safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  
  msgDiv.innerHTML = `
    <img src="${avatarUrl}" class="msg-avatar">
    <div class="msg-content">
      <div class="msg-header">
        <span class="msg-author">${username}</span>
        <span class="msg-time">${time}</span>
      </div>
      <div class="msg-text">${safeText}</div>
    </div>
  `;
  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = msgInput.value.trim();
  if (!text || !currentChannelId || !currentUserProfile) return;
  
  msgInput.value = '';
  await supabase.from('messages').insert([
    { channel_id: currentChannelId, user_id: currentUserProfile.id, content: text }
  ]);
});

// Start the app
checkUser();
