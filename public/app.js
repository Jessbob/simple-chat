const socket = io();
let myUsername = '';
let chatHistories = {}; 
let contacts = []; 

window.onload = () => {
    // Load your saved contacts from memory
    const savedContacts = localStorage.getItem('myContacts');
    if (savedContacts) contacts = JSON.parse(savedContacts);
    
    const savedName = localStorage.getItem('myChatName');
    if (savedName) {
        document.getElementById('username').value = savedName;
        joinChat(); 
    }
};

function joinChat() {
    const usernameInput = document.getElementById('username').value;
    if (usernameInput.trim()) {
        myUsername = usernameInput.trim();
        localStorage.setItem('myChatName', myUsername);
        socket.emit('register', myUsername);
        
        document.getElementById('my-name-display').innerText = myUsername;
        document.getElementById('login-interface').style.display = 'none';
        document.getElementById('chat-interface').style.display = 'block';
        updateContactList();
    }
}

function changeName() {
    localStorage.removeItem('myChatName'); 
    location.reload(); 
}

// MANUALLY ADD A CONTACT
function addContact() {
    const name = document.getElementById('new-contact').value.trim();
    if (name && name !== myUsername && !contacts.includes(name)) {
        contacts.push(name);
        localStorage.setItem('myContacts', JSON.stringify(contacts));
        updateContactList();
    }
    document.getElementById('new-contact').value = '';
}

function updateContactList() {
    const select = document.getElementById('recipient-select');
    const currentlySelected = select.value; 
    select.innerHTML = ''; 
    
    contacts.forEach(user => {
        const option = document.createElement('option');
        option.value = user;
        option.textContent = user;
        select.appendChild(option);
    });
    select.value = currentlySelected; 
}

// RECEIVE HISTORY FROM SERVER ON LOGIN
socket.on('chat history', (messages) => {
    chatHistories = {}; 
    
    messages.forEach(msg => {
        // Figure out who we were talking to
        const partner = msg.sender === myUsername ? msg.recipient : msg.sender;
        
        // Auto-add them to our contact list if they aren't there
        if (!contacts.includes(partner)) {
            contacts.push(partner);
            localStorage.setItem('myContacts', JSON.stringify(contacts));
        }

        if (!chatHistories[partner]) chatHistories[partner] = [];
        
        chatHistories[partner].push({
            sender: msg.sender,
            text: msg.text,
            time: msg.time,
            isOutgoing: msg.sender === myUsername
        });
    });
    
    updateContactList();
    loadConversation(); // Refresh the chat window
});

function checkEnter(event) {
    if (event.key === 'Enter') sendMessage();
}

function loadConversation() {
    const recipient = document.getElementById('recipient-select').value;
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = ''; 

    if (chatHistories[recipient]) {
        chatHistories[recipient].forEach(msg => {
            renderMessage(msg.sender, msg.text, msg.time, msg.isOutgoing);
        });
    }
}

function sendMessage() {
    const recipient = document.getElementById('recipient-select').value;
    const text = document.getElementById('msg-input').value;

    if (recipient && text.trim()) {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        socket.emit('private message', { recipient, message: text, time });
        
        saveAndDisplayMessage(recipient, myUsername, text, time, true);
        document.getElementById('msg-input').value = '';
    } else if (!recipient) {
        alert('Please add or select a user to message first.');
    }
}

// LIVE MESSAGE LISTENER
socket.on('private message', (msg) => {
    // If someone new messages us, add them to contacts
    if (!contacts.includes(msg.sender)) {
        contacts.push(msg.sender);
        localStorage.setItem('myContacts', JSON.stringify(contacts));
        updateContactList();
    }
    saveAndDisplayMessage(msg.sender, msg.sender, msg.text, msg.time, false);
});

function saveAndDisplayMessage(partner, senderName, text, time, isOutgoing) {
    if (!chatHistories[partner]) chatHistories[partner] = [];
    chatHistories[partner].push({ sender: senderName, text: text, time: time, isOutgoing: isOutgoing });

    if (document.getElementById('recipient-select').value === partner) {
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