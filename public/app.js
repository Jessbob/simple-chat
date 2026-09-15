const socket = io();
let myUsername = '';
let currentActiveContact = '';
let chatHistories = {}; 
let contacts = []; 
let unreadStatus = {}; 
let onlineUsers = []; 
let typingTimer;
let isTyping = false;

// --- AUTHENTICATION ---
window.onload = () => {
    const savedToken = localStorage.getItem('messenger_user');
    const savedPass = localStorage.getItem('messenger_pass');
    if (savedToken && savedPass) {
        socket.emit('login', { username: savedToken, password: savedPass });
    }
};

function toggleAuth() {
    const logSec = document.getElementById('login-section');
    const signSec = document.getElementById('signup-section');
    if (logSec.style.display === 'none') {
        logSec.style.display = 'block';
        signSec.style.display = 'none';
    } else {
        logSec.style.display = 'none';
        signSec.style.display = 'block';
    }
}

function attemptLogin() {
    const u = document.getElementById('log-user').value.trim();
    const p = document.getElementById('log-pass').value.trim();
    if (u && p) socket.emit('login', { username: u, password: p });
}

function attemptSignup() {
    const u = document.getElementById('sign-user').value.trim();
    const p = document.getElementById('sign-pass').value.trim();
    if (u && p) socket.emit('signup', { username: u, password: p });
}

socket.on('auth error', (msg) => alert(msg));

socket.on('signup success', (username) => {
    alert("Account created! You can now log in.");
    toggleAuth();
});

socket.on('login success', (username) => {
    myUsername = username;
    localStorage.setItem('messenger_user', username);
    localStorage.setItem('messenger_pass', document.getElementById('log-pass').value || localStorage.getItem('messenger_pass'));
    
    document.getElementById('my-name-display').innerText = myUsername;
    document.getElementById('auth-interface').style.display = 'none';
    document.getElementById('chat-interface').style.display = 'block';
    
    const saved = localStorage.getItem(`${myUsername}_contacts`);
    if (saved) contacts = JSON.parse(saved);
    renderContactList();
});

function logout() {
    localStorage.clear();
    location.reload(); 
}

// --- ONLINE STATUS LISTENERS ---
socket.on('online users list', (list) => {
    onlineUsers = list;
    renderContactList();
    updateChatHeader();
});

socket.on('user status change', ({ username, status }) => {
    if (status === 'online' && !onlineUsers.includes(username)) {
        onlineUsers.push(username);
    } else if (status === 'offline') {
        onlineUsers = onlineUsers.filter(u => u !== username);
    }
    renderContactList();
    updateChatHeader();
});

// --- SEARCH ---
function searchForUser() {
    const searchName = document.getElementById('search-input').value.trim();
    if (searchName === myUsername) {
        alert("You can't add yourself!");
        return;
    }
    if (searchName) socket.emit('search user', searchName);
}

socket.on('search error', (msg) => alert(msg));

socket.on('search result', (foundUser) => {
    if (!contacts.includes(foundUser)) {
        contacts.push(foundUser);
        localStorage.setItem(`${myUsername}_contacts`, JSON.stringify(contacts));
        renderContactList();
    }
    document.getElementById('search-input').value = '';
    selectContact(foundUser); 
});

// --- UI RENDERING ---
function renderContactList() {
    const listDiv = document.getElementById('contact-list');
    listDiv.innerHTML = ''; 
    
    contacts.forEach(user => {
        const item = document.createElement('div');
        let classes = 'contact-item';
        if (user === currentActiveContact) classes += ' active';
        if (unreadStatus[user]) classes += ' unread';
        
        const isOnline = onlineUsers.includes(user);
        const statusClass = isOnline ? 'status-text online' : 'status-text';
        const statusLabel = isOnline ? 'Online' : 'Offline';

        item.className = classes;
        item.innerHTML = `
            <div class="contact-info">
                <span class="contact-name">${user}</span>
                <span class="${statusClass}">${statusLabel}</span>
            </div>
            <span class="dot">🟢</span>
        `;
        
        item.onclick = () => selectContact(user);
        listDiv.appendChild(item);
    });
}

function selectContact(user) {
    currentActiveContact = user;
    unreadStatus[user] = false; 
    
    // Sneaky tab reset!
    if (!Object.values(unreadStatus).includes(true)) {
        document.title = 'Google Classroom';
    }

    renderContactList(); 
    updateChatHeader();
    
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = ''; 
    if (chatHistories[user]) {
        chatHistories[user].forEach(msg => {
            renderMessage(msg.sender, msg.text, msg.time, msg.isOutgoing);
        });
    }
    document.getElementById('typing-indicator').innerText = ''; 
}

function updateChatHeader() {
    const header = document.getElementById('chat-header');
    if (currentActiveContact) {
        const isOnline = onlineUsers.includes(currentActiveContact);
        const color = isOnline ? '#28a745' : 'gray';
        const label = isOnline ? 'Online' : 'Offline';
        header.innerHTML = `Chatting with ${currentActiveContact} <span style="color:${color}; font-size:0.7em;">(${label})</span>`;
    } else {
        header.innerHTML = 'Select a conversation';
    }
}

// --- MESSAGING ---
socket.on('chat history', (messages) => {
    chatHistories = {}; 
    messages.forEach(msg => {
        const partner = msg.sender === myUsername ? msg.recipient : msg.sender;
        if (!contacts.includes(partner)) contacts.push(partner);
        
        if (!chatHistories[partner]) chatHistories[partner] = [];
        chatHistories[partner].push({
            sender: msg.sender, text: msg.text, time: msg.time, isOutgoing: msg.sender === myUsername
        });
    });
    localStorage.setItem(`${myUsername}_contacts`, JSON.stringify(contacts));
    renderContactList();
});

function checkEnter(event) {
    if (event.key === 'Enter') sendMessage();
}

function sendMessage() {
    const text = document.getElementById('msg-input').value;

    if (currentActiveContact && text.trim()) {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        socket.emit('private message', { recipient: currentActiveContact, message: text, time });
        
        isTyping = false;
        clearTimeout(typingTimer);
        socket.emit('stop typing', { recipient: currentActiveContact });

        saveMessageToMemory(currentActiveContact, myUsername, text, time, true);
        document.getElementById('msg-input').value = '';
    } else if (!currentActiveContact) {
        alert('Please select a conversation first.');
    }
}

socket.on('private message', (msg) => {
    if (!contacts.includes(msg.sender)) {
        contacts.push(msg.sender);
        localStorage.setItem(`${myUsername}_contacts`, JSON.stringify(contacts));
    }

    if (msg.sender !== currentActiveContact) {
        unreadStatus[msg.sender] = true; 
        // UPDATED: Now it just adds the dot to the normal title
        document.title = '🟢 Google Classroom'; 
        renderContactList(); 
    }

    saveMessageToMemory(msg.sender, msg.sender, msg.text, msg.time, false);
});

function saveMessageToMemory(partner, senderName, text, time, isOutgoing) {
    if (!chatHistories[partner]) chatHistories[partner] = [];
    chatHistories[partner].push({ sender: senderName, text: text, time: time, isOutgoing: isOutgoing });

    if (currentActiveContact === partner) {
        renderMessage(senderName, text, time, isOutgoing);
    }
}

function renderMessage(sender, text, time, isOutgoing) {
    const messagesDiv = document.getElementById('messages');
    const msgElement = document.createElement('div');
    msgElement.className = 'msg';
    msgElement.style.backgroundColor = isOutgoing ? '#e6f7ff' : '#fff';
    msgElement.innerHTML = `<span class="time">[${time}]</span> <span class="sender">${sender}:</span> ${text}`;
    messagesDiv.appendChild(msgElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// --- TYPING INDICATOR LOGIC ---
document.getElementById('msg-input').addEventListener('input', () => {
    if (!currentActiveContact) return;

    if (!isTyping) {
        isTyping = true;
        socket.emit('typing', { recipient: currentActiveContact });
    }

    clearTimeout(typingTimer);
    
    typingTimer = setTimeout(() => {
        isTyping = false;
        socket.emit('stop typing', { recipient: currentActiveContact });
    }, 1500);
});

socket.on('typing', ({ sender }) => {
    if (currentActiveContact === sender) {
        document.getElementById('typing-indicator').innerText = `${sender} is typing...`;
    }
});

socket.on('stop typing', ({ sender }) => {
    if (currentActiveContact === sender) {
        document.getElementById('typing-indicator').innerText = '';
    }
});