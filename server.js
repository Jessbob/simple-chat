console.log("!!! GEMI DETECTIVE MODE ACTIVE !!!");
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const users = {}; 
const dbPath = path.join(__dirname, 'messages.json'); 
let allMessages = [];

if (fs.existsSync(dbPath)) {
    const savedData = fs.readFileSync(dbPath);
    allMessages = JSON.parse(savedData);
    console.log("-> Loaded existing messages from hard drive.");
} else {
    console.log("-> No previous messages found. Starting fresh.");
}

io.on('connection', (socket) => {
    socket.on('register', (username) => {
        users[socket.id] = username;
        const history = allMessages.filter(
            msg => msg.sender === username || msg.recipient === username
        );
        socket.emit('chat history', history);
    });

    socket.on('private message', ({ recipient, message, time }) => {
        const sender = users[socket.id];
        const msgData = { sender, recipient, text: message, time };
        
        allMessages.push(msgData);

        try {
            fs.writeFileSync(dbPath, JSON.stringify(allMessages, null, 2));
            console.log(`-> Saved message from ${sender} to ${recipient}`);
        } catch (err) {
            console.error("-> ERROR SAVING FILE:", err);
        }

        const recipientId = Object.keys(users).find(key => users[key] === recipient);
        if (recipientId) {
            io.to(recipientId).emit('private message', msgData);
        }
    });

    socket.on('disconnect', () => {
        delete users[socket.id];
    });
});

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});