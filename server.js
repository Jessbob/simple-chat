const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const activeSockets = {}; 

const dbMessages = path.join(__dirname, 'messages.json'); 
const dbAccounts = path.join(__dirname, 'users.json'); 

let allMessages = [];
let accounts = {}; 

if (fs.existsSync(dbMessages)) allMessages = JSON.parse(fs.readFileSync(dbMessages));
if (fs.existsSync(dbAccounts)) accounts = JSON.parse(fs.readFileSync(dbAccounts));

io.on('connection', (socket) => {
    
    socket.on('signup', ({ username, password }) => {
        if (accounts[username]) {
            socket.emit('auth error', 'Username is already taken!');
        } else {
            accounts[username] = password;
            fs.writeFileSync(dbAccounts, JSON.stringify(accounts, null, 2));
            socket.emit('signup success', username);
        }
    });

    socket.on('login', ({ username, password }) => {
        if (accounts[username] && accounts[username] === password) {
            activeSockets[socket.id] = username;
            socket.emit('login success', username);
            
            const history = allMessages.filter(
                msg => msg.sender === username || msg.recipient === username
            );
            socket.emit('chat history', history);

            const onlineUsers = [...new Set(Object.values(activeSockets))];
            socket.emit('online users list', onlineUsers);
            
            io.emit('user status change', { username, status: 'online' });
        } else {
            socket.emit('auth error', 'Invalid username or password!');
        }
    });

    socket.on('search user', (searchName) => {
        if (accounts[searchName]) {
            socket.emit('search result', searchName); 
        } else {
            socket.emit('search error', 'User does not exist.');
        }
    });

    socket.on('private message', ({ recipient, message, time }) => {
        const sender = activeSockets[socket.id];
        const msgData = { sender, recipient, text: message, time };
        
        allMessages.push(msgData);
        fs.writeFileSync(dbMessages, JSON.stringify(allMessages, null, 2));

        const recipientId = Object.keys(activeSockets).find(key => activeSockets[key] === recipient);
        if (recipientId) {
            io.to(recipientId).emit('private message', msgData);
        }
    });

    socket.on('typing', ({ recipient }) => {
        const sender = activeSockets[socket.id];
        const recipientId = Object.keys(activeSockets).find(key => activeSockets[key] === recipient);
        if (recipientId) io.to(recipientId).emit('typing', { sender });
    });

    socket.on('stop typing', ({ recipient }) => {
        const sender = activeSockets[socket.id];
        const recipientId = Object.keys(activeSockets).find(key => activeSockets[key] === recipient);
        if (recipientId) io.to(recipientId).emit('stop typing', { sender });
    });

    socket.on('disconnect', () => {
        const disconnectedUser = activeSockets[socket.id];
        delete activeSockets[socket.id];
        
        if (disconnectedUser) {
            const isStillOnline = Object.values(activeSockets).includes(disconnectedUser);
            if (!isStillOnline) {
                io.emit('user status change', { username: disconnectedUser, status: 'offline' });
            }
        }
    });
});

server.listen(3000, () => {
    console.log('Stealth Server is running on http://localhost:3000');
});