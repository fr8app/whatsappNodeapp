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
const authToken = '5f3f80cea5774a15530e44d1f77f5b5c';
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
    date: { type: Date, default: Date.now }
});

const groupSchema = new mongoose.Schema({
    name: String,
    members: [String]
});

const Message = mongoose.model('Message', messageSchema);
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
app.post('/send', async (req, res) => {
    const { message, to } = req.body;
    const from = 'whatsapp:+18434843838'; // Your Twilio WhatsApp number

    console.log(`Sending message: ${message} to: ${to}`);

    if (!message || !to) {
        console.error('Message or recipient number is missing');
        return res.status(400).json({ error: 'Message or recipient number is missing' });
    }

    try {
        const group = await Group.findById(to);

        if (group) {
            // Sending message to all group members
            group.members.forEach(member => {
                client.messages.create({
                    body: message,
                    from: from, // Ensure this is a Twilio WhatsApp number
                    to: `whatsapp:${standardizeNumber(member)}`
                }).then(sentMessage => {
                    console.log(`Message sent to group member with SID: ${sentMessage.sid}`);
                }).catch(error => {
                    console.error(`Error sending message to group member ${member}:`, error);
                });
            });

            const newMessage = new Message({ from, to: group.name, body: message });
            await newMessage.save();

            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ from, to: group.name, message }));
                }
            });

            res.status(200).json({ message: 'Message sent to group' });
        } else {
            // Sending message to an individual
            const sentMessage = await client.messages.create({
                body: message,
                from: from, // Ensure this is a Twilio WhatsApp number
                to: `whatsapp:${standardizeNumber(to)}`
            });

            console.log(`Message sent with SID: ${sentMessage.sid}`);

            const newMessage = new Message({ from, to: standardizeNumber(to), body: message });
            await newMessage.save();

            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ from, to: standardizeNumber(to), message }));
                }
            });

            res.status(200).json({ message: 'Message sent' });
        }
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// Endpoint to create a group
app.post('/createGroup', (req, res) => {
    const { groupName, members } = req.body;

    const newGroup = new Group({ name: groupName, members: members });
    newGroup.save().then(group => {
        res.status(200).json({ groupId: group._id });
    }).catch(err => {
        console.error('Error creating group:', err);
        res.status(500).send('Error creating group');
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
        const messages = await Message.find();
        const contacts = {};

        messages.forEach(msg => {
            const from = standardizeNumber(msg.from);
            const to = standardizeNumber(msg.to);

            if (from !== standardizeNumber('whatsapp:+18434843838')) {
                contacts[from] = { number: from };
            } else {
                contacts[to] = { number: to };
            }
        });

        const groups = await Group.find();
        groups.forEach(group => {
            contacts[group._id] = { groupName: group.name, groupId: group._id };
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
