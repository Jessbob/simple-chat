const socket = io();
let myUsername = '';
let currentActiveContact = '';
let chatHistories = {}; 
let contacts = []; 
let unreadStatus = {}; 
let onlineUsers = []; 
let lastActiveData = {}; 

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.location.replace("https://classroom.google.com");
});

window.onload = () => {
    const savedToken = localStorage.getItem('messenger_user');
    const savedPass = localStorage.getItem('messenger_pass');
    if (savedToken && savedPass) socket.emit('login', { username: savedToken, password: savedPass });
};

function toggleAuth() {
    const logSec = document.getElementById('login-section');
    const signSec = document.getElementById('signup-section');
    logSec.style.display = logSec.style.display === 'none' ? 'block' : 'none';
    signSec.style.display = signSec.style.display === 'none' ? 'block' : 'none';
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

socket.on('signup success', () => {
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

socket.on('group list', (groupNames) => {
    groupNames.forEach(g => { if (!contacts.includes(g)) contacts.push(g); });
    localStorage.setItem(`${myUsername}_contacts`, JSON.stringify(contacts));
    renderContactList();
});

socket.on('new group', (groupName) => {
    if (!contacts.includes(groupName)) {
        contacts.push(groupName);
        localStorage.setItem(`${myUsername}_contacts`, JSON.stringify(contacts));
        renderContactList();
        alert(`You were added to group: ${groupName}`);
    }
});

function createGroup() {
    const groupName = prompt("Enter a name for the new group chat:");
    if (!groupName) return;
    const membersStr = prompt("Enter the usernames to add, separated by commas (e.g. jessbob, john123):");
    if (!membersStr) return;
    
    const members = membersStr.split(',').map(m => m.trim()).filter(m => m !== myUsername && m !== "");
    if (members.length > 0) socket.emit('create group', { groupName, members });
    else alert("You need to add at least one other person!");
}

function addMemberToGroup() {
    if (!currentActiveContact || !currentActiveContact.startsWith('#')) return;
    const newMember = prompt("Enter the username of the person you want to add to this group:");
    if (!newMember) return;

    socket.emit('add group member', { groupName: currentActiveContact, username: newMember.trim() });
}

socket.on('last active data', (data) => lastActiveData = data);

socket.on('online users list', (list) => {
    onlineUsers = list;
    renderContactList();
    updateChatHeader();
});

socket.on('user status change', ({ username, status, lastActive }) => {
    if (status === 'online' && !onlineUsers.includes(username)) onlineUsers.push(username);
    else if (status === 'offline') {
        onlineUsers = onlineUsers.filter(u => u !== username);
        if (lastActive) lastActiveData[username] = lastActive; 
    }
    renderContactList();
    updateChatHeader();
});

function searchForUser() {
    const searchName = document.getElementById('search-input').value.trim();
    if (searchName === myUsername) return alert("You can't add yourself!");
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

function renderContactList() {
    const listDiv = document.getElementById('contact-list');
    listDiv.innerHTML = ''; 
    contacts = contacts.filter(c => c && c !== 'null' && c !== 'undefined');
    
    contacts.forEach(user => {
        const item = document.createElement('div');
        let classes = 'contact-item' + (user === currentActiveContact ? ' active' : '') + (unreadStatus[user] ? ' unread' : '');
        
        const isGroup = user.startsWith('#');
        const isOnline = !isGroup && onlineUsers.includes(user);
        const statusLabel = isGroup ? '👥 Group Chat' : (isOnline ? 'Online' : 'Offline');
        const statusClass = isGroup ? 'online' : (isOnline ? 'online' : '');
        
        item.className = classes;
        item.innerHTML = `
            <div class="contact-info">
                <span class="contact-name">${user}</span>
                <span class="status-text ${statusClass}">${statusLabel}</span>
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
    if (!Object.values(unreadStatus).includes(true)) document.title = 'Google Classroom';

    renderContactList(); 
    updateChatHeader();
    
    if (!user.startsWith('#')) {
        socket.emit('mark read', { partner: user });
        if (chatHistories[user]) chatHistories[user].forEach(msg => { if (!msg.isOutgoing) msg.isRead = true; });
    }
    
    renderMessagesForActiveContact();
}

function renderMessagesForActiveContact() {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = ''; 
    if (chatHistories[currentActiveContact]) {
        chatHistories[currentActiveContact].forEach(msg => {
            renderMessage(msg.sender, msg.text, msg.time, msg.isOutgoing, msg.isRead, msg.image);
        });
    }
}

function updateChatHeader() {
    const header = document.getElementById('chat-header');
    if (currentActiveContact) {
        const isGroup = currentActiveContact.startsWith('#');
        const isOnline = !isGroup && onlineUsers.includes(currentActiveContact);
        const color = (isOnline || isGroup) ? '#28a745' : 'gray';
        const label = isGroup ? 'Group Room' : (isOnline ? 'Online' : `Offline (Last seen: ${lastActiveData[currentActiveContact] || 'Unknown'})`);
        
        let buttonsHtml = `<button onclick="deleteConversation()" style="background: #dc3545; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9em;">🗑️ Delete</button>`;
        
        if (isGroup) {
            buttonsHtml = `<button onclick="addMemberToGroup()" style="background: #007bff; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9em; margin-right: 5px;">➕ Add Member</button>` + buttonsHtml;
        }

        header.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span>Chatting with ${currentActiveContact} <span style="color:${color}; font-size:0.7em;">(${label})</span></span>
                <div>${buttonsHtml}</div>
            </div>
        `;
    } else {
        header.innerHTML = 'Select a conversation';
    }
}

function deleteConversation() {
    if (!currentActiveContact) return;
    const confirmDelete = confirm("Are you sure you want to permanently delete this chat? This will instantly wipe it for everyone and cannot be undone.");
    if (confirmDelete) {
        socket.emit('delete conversation', { partner: currentActiveContact });
    }
}

socket.on('conversation deleted', (partnerToRemove) => {
    contacts = contacts.filter(c => c !== partnerToRemove);
    localStorage.setItem(`${myUsername}_contacts`, JSON.stringify(contacts));
    delete chatHistories[partnerToRemove];
    
    if (currentActiveContact === partnerToRemove) {
        currentActiveContact = '';
        document.getElementById('messages').innerHTML = '';
        updateChatHeader();
    }
    renderContactList();
});

socket.on('chat history', (messages) => {
    chatHistories = {}; 
    messages.forEach(msg => {
        const isGroup = msg.recipient.startsWith('#');
        const partner = isGroup ? msg.recipient : (msg.sender === myUsername ? msg.recipient : msg.sender);
        
        if (!contacts.includes(partner)) contacts.push(partner);
        if (!chatHistories[partner]) chatHistories[partner] = [];
        
        chatHistories[partner].push({ sender: msg.sender, text: msg.text, image: msg.image, time: msg.time, isOutgoing: msg.sender === myUsername, isRead: msg.isRead });
    });
    localStorage.setItem(`${myUsername}_contacts`, JSON.stringify(contacts));
    renderContactList();
});

function checkEnter(event) { if (event.key === 'Enter') sendMessage(); }

function sendMessage() {
    const text = document.getElementById('msg-input').value;
    if (currentActiveContact && text.trim()) {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        socket.emit('chat message', { recipient: currentActiveContact, message: text, image: null, time });
        saveMessageToMemory(currentActiveContact, myUsername, text, time, true, false, null); 
        document.getElementById('msg-input').value = '';
    }
}

function processAndSendImage(event) {
    const file = event.target.files[0];
    if (!file || !currentActiveContact) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const scaleSize = 500 / img.width;
            canvas.width = 500; canvas.height = img.height * scaleSize;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6); 
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            socket.emit('chat message', { recipient: currentActiveContact, message: "📷 Photo", image: compressedBase64, time });
            saveMessageToMemory(currentActiveContact, myUsername, "📷 Photo", time, true, false, compressedBase64);
        }
        img.src = e.target.result;
    }
    reader.readAsDataURL(file);
}

socket.on('chat message', (msg) => {
    if (!msg.sender || msg.sender === 'undefined' || msg.sender === 'null') return;
    const isGroup = msg.recipient.startsWith('#');
    const partner = isGroup ? msg.recipient : msg.sender;

    if (!contacts.includes(partner)) {
        contacts.push(partner);
        localStorage.setItem(`${myUsername}_contacts`, JSON.stringify(contacts));
    }

    if (msg.sender === myUsername && isGroup) return; 

    if (partner !== currentActiveContact || document.hidden) {
        unreadStatus[partner] = true; 
        document.title = '🟢 Google Classroom'; 
        renderContactList(); 
    } else if (!isGroup) {
        socket.emit('mark read', { partner: msg.sender });
        msg.isRead = true;
    }

    saveMessageToMemory(partner, msg.sender, msg.text, msg.time, false, msg.isRead, msg.image);
});

socket.on('messages were read', ({ by }) => {
    if (chatHistories[by]) chatHistories[by].forEach(msg => { if (msg.isOutgoing) msg.isRead = true; });
    if (currentActiveContact === by) renderMessagesForActiveContact();
});

function saveMessageToMemory(partner, senderName, text, time, isOutgoing, isRead, imageBase64) {
    if (!chatHistories[partner]) chatHistories[partner] = [];
    chatHistories[partner].push({ sender: senderName, text: text, time: time, isOutgoing: isOutgoing, isRead: isRead, image: imageBase64 });
    if (currentActiveContact === partner) renderMessage(senderName, text, time, isOutgoing, isRead, imageBase64);
}

function renderMessage(sender, text, time, isOutgoing, isRead, imageBase64) {
    const messagesDiv = document.getElementById('messages');
    const msgElement = document.createElement('div');
    msgElement.className = 'msg';
    msgElement.style.backgroundColor = isOutgoing ? '#e6f7ff' : '#fff';
    
    let content = `<span class="time">[${time}]</span> <span class="sender">${sender}:</span> `;
    if (imageBase64) content += `<br><img src="${imageBase64}" style="max-width: 100%; max-height: 300px; border-radius: 8px; margin-top: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">`;
    else content += text;
    
    msgElement.innerHTML = content;
    
    if (isOutgoing && !currentActiveContact.startsWith('#')) {
        const statusText = isRead ? '<span style="color:#28a745;">Read</span>' : 'Delivered';
        msgElement.innerHTML += `<div style="font-size: 0.7em; text-align: right; color: #aaa; margin-top: 2px;">${statusText}</div>`;
    }

    messagesDiv.appendChild(msgElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}