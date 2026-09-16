require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const mongoURI = process.env.MONGO_URI; 
mongoose.connect(mongoURI)
    .then(() => console.log('✅ Connected to MongoDB cloud!'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    lastActive: { type: String, default: 'Just joined' }
});
const User = mongoose.model('User', UserSchema);

const GroupSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    members: [String]
});
const Group = mongoose.model('Group', GroupSchema);

const MessageSchema = new mongoose.Schema({
    sender: String,
    recipient: String, 
    text: String,
    image: String,
    time: String,
    isRead: { type: Boolean, default: false }
});
const Message = mongoose.model('Message', MessageSchema);

const activeSockets = {}; 

io.on('connection', (socket) => {
    socket.on('signup', async ({ username, password }) => {
        try {
            const existingUser = await User.findOne({ username });
            if (existingUser) return socket.emit('auth error', 'Username is already taken!');
            
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            await User.create({ username, password, lastActive: time });
            socket.emit('signup success', username);
        } catch (err) { console.error(err); }
    });

    socket.on('login', async ({ username, password }) => {
        try {
            const user = await User.findOne({ username, password });
            if (user) {
                activeSockets[socket.id] = username;
                socket.emit('login success', username);
                
                const myGroups = await Group.find({ members: username });
                const myGroupNames = myGroups.map(g => g.name);
                myGroupNames.forEach(groupName => socket.join(groupName));

                const history = await Message.find({
                    $or: [
                        { sender: username }, 
                        { recipient: username },
                        { recipient: { $in: myGroupNames } }
                    ]
                });
                
                socket.emit('group list', myGroupNames);
                socket.emit('chat history', history);

                const allUsers = await User.find({}, 'username lastActive');
                const lastActiveData = {};
                allUsers.forEach(u => lastActiveData[u.username] = u.lastActive);
                socket.emit('last active data', lastActiveData);

                const onlineUsers = [...new Set(Object.values(activeSockets))];
                socket.emit('online users list', onlineUsers);
                io.emit('user status change', { username, status: 'online' });
            } else {
                socket.emit('auth error', 'Invalid username or password!');
            }
        } catch (err) { console.error(err); }
    });

    socket.on('create group', async ({ groupName, members }) => {
        const sender = activeSockets[socket.id];
        if (!sender) return;

        const formattedName = '#' + groupName.replace(/\s+/g, '-').toLowerCase();
        const allMembers = [...new Set([...members, sender])]; 

        try {
            await Group.create({ name: formattedName, members: allMembers });
            allMembers.forEach(member => {
                const memberSocketId = Object.keys(activeSockets).find(key => activeSockets[key] === member);
                if (memberSocketId) {
                    const memberSocket = io.sockets.sockets.get(memberSocketId);
                    if (memberSocket) memberSocket.join(formattedName);
                    io.to(memberSocketId).emit('new group', formattedName);
                }
            });
        } catch (err) {
            socket.emit('search error', 'Group name already taken or invalid.');
        }
    });

    socket.on('add group member', async ({ groupName, username }) => {
        const sender = activeSockets[socket.id];
        if (!sender) return;

        try {
            const userExists = await User.findOne({ username });
            if (!userExists) {
                return socket.emit('search error', 'That user does not exist.');
            }

            const updatedGroup = await Group.findOneAndUpdate(
                { name: groupName },
                { $addToSet: { members: username } },
                { new: true }
            );

            if (!updatedGroup) {
                return socket.emit('search error', 'Group not found.');
            }

            const memberSocketId = Object.keys(activeSockets).find(key => activeSockets[key] === username);
            if (memberSocketId) {
                const memberSocket = io.sockets.sockets.get(memberSocketId);
                if (memberSocket) memberSocket.join(groupName);
                io.to(memberSocketId).emit('new group', groupName);
            }

            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const announcement = await Message.create({
                sender: 'System',
                recipient: groupName,
                text: `${sender} added ${username} to the group.`,
                time,
                isRead: true
            });

            io.to(groupName).emit('chat message', announcement);

        } catch (err) {
            console.error("Error adding group member:", err);
            socket.emit('search error', 'Failed to add member.');
        }
    });

    socket.on('search user', async (searchName) => {
        const user = await User.findOne({ username: searchName });
        if (user) socket.emit('search result', searchName); 
        else socket.emit('search error', 'User does not exist.');
    });

    socket.on('chat message', async ({ recipient, message, image, time }) => {
        const sender = activeSockets[socket.id];
        if (!sender) return socket.emit('auth error', 'Session expired. Please refresh the page.');

        const msgData = { sender, recipient, text: message, image, time, isRead: false };
        const savedMsg = await Message.create(msgData);

        if (recipient.startsWith('#')) {
            io.to(recipient).emit('chat message', savedMsg); 
        } else {
            const recipientId = Object.keys(activeSockets).find(key => activeSockets[key] === recipient);
            if (recipientId) io.to(recipientId).emit('chat message', savedMsg); 
        }
    });

    socket.on('mark read', async ({ partner }) => {
        const myName = activeSockets[socket.id];
        if (!myName || partner.startsWith('#')) return; 

        await Message.updateMany(
            { sender: partner, recipient: myName, isRead: false },
            { $set: { isRead: true } }
        );

        const partnerId = Object.keys(activeSockets).find(key => activeSockets[key] === partner);
        if (partnerId) io.to(partnerId).emit('messages were read', { by: myName });
    });

    socket.on('delete conversation', async ({ partner }) => {
        const myName = activeSockets[socket.id];
        if (!myName) return;

        try {
            if (partner.startsWith('#')) {
                await Message.deleteMany({ recipient: partner });
                await Group.deleteOne({ name: partner });
                io.emit('conversation deleted', partner);
            } else {
                await Message.deleteMany({
                    $or: [
                        { sender: myName, recipient: partner },
                        { sender: partner, recipient: myName }
                    ]
                });
                
                const partnerId = Object.keys(activeSockets).find(key => activeSockets[key] === partner);
                if (partnerId) io.to(partnerId).emit('conversation deleted', myName);
                
                socket.emit('conversation deleted', partner);
            }
        } catch (err) {
            console.error("Deletion error:", err);
        }
    });

    socket.on('disconnect', async () => {
        const disconnectedUser = activeSockets[socket.id];
        delete activeSockets[socket.id];
        if (disconnectedUser) {
            const isStillOnline = Object.values(activeSockets).includes(disconnectedUser);
            if (!isStillOnline) {
                const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                await User.updateOne({ username: disconnectedUser }, { lastActive: time });
                io.emit('user status change', { username: disconnectedUser, status: 'offline', lastActive: time });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Master Server is running on port ${PORT}`));