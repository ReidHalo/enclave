// --- 1. Identity Setup ---
// In a real app, this is handled by Supabase Auth. For now, we assign a local identity.
let currentUser = localStorage.getItem('enclave_username');
if (!currentUser) {
  currentUser = prompt("Enter your Enclave Agent designation:") || `Agent_${Math.floor(Math.random() * 1000)}`;
  localStorage.setItem('enclave_username', currentUser);
}

// Update UI with username
document.getElementById('my-username').textContent = currentUser;
document.getElementById('my-avatar').textContent = currentUser.charAt(0).toUpperCase();

// --- 2. DOM Elements ---
const form = document.getElementById('chat-form');
const input = document.getElementById('msg-input');
const messagesContainer = document.getElementById('messages');

// --- 3. Database Mock (LocalStorage) ---
function getMessages() {
  const data = localStorage.getItem('enclave_messages');
  return data ? JSON.parse(data) : [];
}

function saveMessage(text) {
  const messages = getMessages();
  const newMessage = {
    id: Date.now(),
    author: currentUser,
    text: text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  
  // NOTE FOR LATER: This is where we will implement Web Crypto API E2E Encryption 
  // before pushing `newMessage` to Supabase.
  
  messages.push(newMessage);
  localStorage.setItem('enclave_messages', JSON.stringify(messages));
  renderMessages();
}

// --- 4. Render UI ---
function renderMessages() {
  const messages = getMessages();
  messagesContainer.innerHTML = '';
  
  messages.forEach(msg => {
    const msgElement = document.createElement('div');
    msgElement.classList.add('message');
    
    msgElement.innerHTML = `
      <div class="msg-avatar" style="display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-weight:bold;">
        ${msg.author.charAt(0).toUpperCase()}
      </div>
      <div class="msg-content">
        <div class="msg-header">
          <span class="msg-author">${msg.author}</span>
          <span class="msg-time">${msg.timestamp}</span>
        </div>
        <div class="msg-text">${escapeHTML(msg.text)}</div>
      </div>
    `;
    messagesContainer.appendChild(msgElement);
  });

  // Auto-scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Security: Prevent basic XSS in our local app
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// --- 5. Event Listeners ---
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (text) {
    saveMessage(text);
    input.value = '';
  }
});

// Listen for updates from other tabs to simulate real-time syncing
window.addEventListener('storage', (e) => {
  if (e.key === 'enclave_messages') {
    renderMessages();
  }
});

// Initial Render
renderMessages();
