const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { MessagingResponse } = require('twilio').twiml;
const twilio = require('twilio');
const path = require('path');
const WebSocket = require('ws');

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const accountSid = 'ACac793f02cf5fd252f8206d87bb06d91a';
const authToken = 'your_auth_token'; // Use the correct Twilio auth token here
const client = new twilio(accountSid, authToken);

const employees = [
    { name: 'Nivedita', number: '+919922637115' },
    { name: 'Guillermo', number: '+12019264229' },
    // Add more employees here
];

// Connect to MongoDB
mongoose.connect('mongodb://mongodb:27017/whatsappDB', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB:', err));

// Define message schema and model
const messageSchema = new mongoose.Schema({
    from: String,
    to: String,
    body: String,
    date: { type: Date, default: Date.now },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null }
});

const Message = mongoose.model('Message', messageSchema);

// Define group schema and model
const groupSchema = new mongoose.Schema({
    name: String,
    members: [String]
});

const Group = mongoose.model('Group', groupSchema);

// Standardize contact number
const standardizeNumber = (number) => number.replace('whatsapp:', '');

// Endpoint to handle incoming messages from customers/drivers
app.post('/incoming', (req, res) => {
    const message = req.body.Body;
    const from = standardizeNumber(req.body.From);

    console.log(`Received message from ${from}: ${message}`);

    const newMessage = new Message({ from, body: message, to: standardizeNumber('whatsapp:+18434843838') });
    newMessage.save().then(() => {
        employees.forEach(employee => {
            client.messages.create({
                body: `Message from ${from}: ${message}`,
                from: 'whatsapp:+18434843838', // Your Twilio WhatsApp number
                to: `whatsapp:${standardizeNumber(employee.number)}`
            }).then(message => console.log(`Message sent with SID: ${message.sid}`))
              .catch(err => console.error(`Error sending message to ${employee.number}:`, err));
        });

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ from, message }));
            }
        });

        const twiml = new MessagingResponse();
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(twiml.toString());
    }).catch(err => {
        console.error('Error saving incoming message to database:', err);
        res.status(500).send('Error saving incoming message to database');
    });
});

// Endpoint for employees to send messages to customers/drivers
app.post('/send', (req, res) => {
    const { message, to, groupId } = req.body;
    const from = 'whatsapp:+18434843838'; // Your Twilio WhatsApp number

    console.log(`Sending message: ${message} to: ${to}`);

    if (!message || (!to && !groupId)) {
        console.error('Message or recipient number is missing');
        return res.status(400).json({ error: 'Message or recipient number is missing' });
    }

    if (groupId) {
        Group.findById(groupId).then(group => {
            if (!group) {
                return res.status(404).json({ error: 'Group not found' });
            }

            const promises = group.members.map(member => {
                return client.messages.create({
                    body: message,
                    from: from, // Ensure this is a Twilio WhatsApp number
                    to: `whatsapp:${standardizeNumber(member)}`
                }).then(sentMessage => {
                    console.log(`Message sent with SID: ${sentMessage.sid}`);
                    return new Message({ from, to: standardizeNumber(member), body: message, group: groupId }).save();
                });
            });

            Promise.all(promises).then(() => {
                res.status(200).json({ message: 'Message sent to group' });

                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ from, to: groupId, message }));
                    }
                });
            }).catch(error => {
                console.error('Error sending message to group:', error);
                res.status(500).json({ error: 'Twilio error', details: error.message });
            });
        }).catch(error => {
            console.error('Error finding group:', error);
            res.status(500).json({ error: 'Database error', details: error.message });
        });
    } else {
        client.messages.create({
            body: message,
            from: from, // Ensure this is a Twilio WhatsApp number
            to: `whatsapp:${standardizeNumber(to)}`
        }).then(sentMessage => {
            console.log(`Message sent with SID: ${sentMessage.sid}`);

            const newMessage = new Message({ from, to: standardizeNumber(to), body: message });
            newMessage.save().then(() => {
                res.status(200).json({ message: 'Message sent' });

                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ from, to: standardizeNumber(to), message }));
                    }
                });
            }).catch(saveError => {
                console.error('Error saving outgoing message to database:', saveError);
                res.status(500).json({ error: 'Database error', details: saveError.message });
            });
        }).catch(error => {
            console.error('Error sending message:', error);
            res.status(500).json({ error: 'Twilio error', details: error.message });
        });
    }
});

// Endpoint to create a group
app.post('/groups', (req, res) => {
    const { name, members } = req.body;

    if (!name || !members || !Array.isArray(members)) {
        return res.status(400).json({ error: 'Group name and members are required' });
    }

    const group = new Group({ name, members });
    group.save().then(savedGroup => {
        res.status(201).json({ message: 'Group created', group: savedGroup });
    }).catch(error => {
        console.error('Error creating group:', error);
        res.status(500).json({ error: 'Database error', details: error.message });
    });
});

// Endpoint to fetch all messages
app.get('/messages', (req, res) => {
    Message.find().sort({ date: -1 }).then(messages => res.json(messages)).catch(err => {
        console.error('Error fetching messages:', err);
        res.status(500).send('Error fetching messages');
    });
});

// Endpoint to fetch unique contacts and groups from messages
app.get('/contacts', async (req, res) => {
    try {
        const messages = await Message.find().populate('group');
        const contacts = {};

        messages.forEach(msg => {
            const from = standardizeNumber(msg.from);
            const to = standardizeNumber(msg.to);

            if (msg.group) {
                contacts[msg.group._id] = { name: msg.group.name, groupId: msg.group._id };
            } else if (from !== standardizeNumber('whatsapp:+18434843838')) {
                contacts[from] = { number: from };
            } else {
                contacts[to] = { number: to };
            }
        });

        const contactList = Object.values(contacts);
        res.json(contactList);
    } catch (err) {
        console.error('Error fetching contacts from database:', err);
        res.status(500).send('Error fetching contacts from database');
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(8080, () => {
    console.log(`Server is running on port 8080`);
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.on('message', (message) => {
        console.log('Received:', message);
    });
    ws.on('close', () => {
        console.log('Client disconnected');
    });
});
