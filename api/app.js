// 1. Initialize Supabase (PUT YOUR KEYS HERE)
const supabase = window.supabase.createClient('https://aflbmhfwywugdcmwmdpa.supabase.co/rest/v1/', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmbGJtaGZ3eXd1Z2RjbXdtZHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MTQyMTgsImV4cCI6MjEwMzE5MDIxOH0.iS5jxIB5yeaCHsqLBVzfxBFo5zPI6yCAsYjuL8SvTmM');

// 2. Auth DOM Elements
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');

const goToSignupBtn = document.getElementById('go-to-signup');
const goToLoginBtn = document.getElementById('go-to-login');
const logoutBtn = document.getElementById('logout-btn');

// Toggle UI between Login and Sign Up
goToSignupBtn.addEventListener('click', () => {
  loginForm.style.display = 'none';
  signupForm.style.display = 'block';
  document.getElementById('signup-error').textContent = '';
});

goToLoginBtn.addEventListener('click', () => {
  signupForm.style.display = 'none';
  loginForm.style.display = 'block';
  document.getElementById('login-error').textContent = '';
});

// --- SIGN UP LOGIC ---
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorText = document.getElementById('signup-error');
  errorText.textContent = 'Processing...';
  
  const username = document.getElementById('signup-username').value.trim();
  const password = document.getElementById('signup-password').value;
  const email = document.getElementById('signup-email').value.trim();
  const avatar = document.getElementById('signup-avatar').value.trim();

  // 1. Check if username is already taken
  const { data: existingUser } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .single();

  if (existingUser) {
    errorText.textContent = 'Username taken';
    return;
  }

  // 2. Create the account in Supabase
  const { data, error } = await supabase.auth.signUp({ email, password });
  
  if (error) {
    errorText.textContent = error.message;
  } else if (data.user) {
    // 3. Save their custom profile details
    await supabase.from('profiles').insert([{
      id: data.user.id,
      username: username,
      avatar_url: avatar
    }]);
    
    alert("Account created! You can now log in.");
    goToLoginBtn.click(); // Send them back to login page
  }
});

// --- LOG IN LOGIC ---
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorText = document.getElementById('login-error');
  errorText.textContent = 'Connecting...';
  
  const usernameInput = document.getElementById('login-username').value.trim();
  const passwordInput = document.getElementById('login-password').value;

  // 1. Ask the database for the email connected to this username
  const { data: email, error: rpcError } = await supabase.rpc('get_user_email', { p_username: usernameInput });

  if (!email || rpcError) {
    errorText.textContent = 'Invalid username or password.';
    return;
  }

  // 2. Log in using the hidden email we just found
  const { error } = await supabase.auth.signInWithPassword({
    email: email,
    password: passwordInput
  });

  if (error) {
    errorText.textContent = error.message;
  } else {
    checkUser(); // Success! Load the chat.
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

// Start the app check
checkUser();
