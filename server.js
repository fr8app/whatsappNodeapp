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
const authToken = '287c05680510f3515939b3b79eb0be97';
const client = new twilio(accountSid, authToken);

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/whatsappDB', { useNewUrlParser: true, useUnifiedTopology: true });

// Define message schema and model
const messageSchema = new mongoose.Schema({
    from: String,
    to: String,
    body: String,
    date: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// Define contact schema and model
const contactSchema = new mongoose.Schema({
    name: String,
    number: String
});

const Contact = mongoose.model('Contact', contactSchema);

// Endpoint to handle incoming messages from customers/drivers
app.post('/incoming', (req, res) => {
    const message = req.body.Body;
    const from = req.body.From;

    // Log the message or process it as needed
    console.log(`Received message from ${from}: ${message}`);

    // Store the incoming message in the database
    const newMessage = new Message({ from, body: message, to: 'whatsapp:+18434843838' });
    newMessage.save().then(() => {
        // Forward the message to all employees
        employees.forEach(employee => {
            client.messages.create({
                body: `Message from ${from}: ${message}`,
                from: 'whatsapp:+18434843838', // Your Twilio WhatsApp number
                to: `whatsapp:${employee.number}`
            }).then(message => console.log(`Message sent with SID: ${message.sid}`))
              .catch(err => console.error(`Error sending message to ${employee.number}:`, err));
        });

        // Send the message to all connected WebSocket clients
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
    const { message, to } = req.body;
    const from = 'whatsapp:+18434843838'; // Your Twilio WhatsApp number

    // Log the request data for debugging
    console.log(`Sending message: ${message} to: ${to}`);

    if (!message || !to) {
        console.error('Message or recipient number is missing');
        return res.status(400).json({ error: 'Message or recipient number is missing' });
    }

    // Send the message to the specified customer/driver number
    client.messages.create({
        body: message,
        from,
        to: `whatsapp:${to}`
    }).then(sentMessage => {
        // Log the message SID for debugging
        console.log(`Message sent with SID: ${sentMessage.sid}`);

        // Store the outgoing message in the database
        const newMessage = new Message({ from, to, body: message });
        newMessage.save().then(() => {
            res.status(200).json({ message: 'Message sent' });

            // Send the message to all connected WebSocket clients
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ from, to, message }));
                }
            });
        }).catch(saveError => {
            // Log the save error details
            console.error('Error saving outgoing message to database:', saveError);

            // Return detailed error response
            res.status(500).json({ error: 'Database error', details: saveError.message });
        });
    }).catch(error => {
        // Log the error details
        console.error('Error sending message:', error);

        // Return detailed error response
        res.status(500).json({ error: 'Twilio error', details: error.message });
    });
});

// Endpoint to fetch all messages
app.get('/messages', (req, res) => {
    Message.find().sort({ date: -1 }).then(messages => res.json(messages)).catch(err => res.status(500).send(err));
});

// Endpoint to fetch all contacts
app.get('/contacts', (req, res) => {
    Contact.find().then(contacts => res.json(contacts)).catch(err => res.status(500).send(err));
});

// Endpoint to add a new contact
app.post('/contacts', (req, res) => {
    const { name, number } = req.body;
    const newContact = new Contact({ name, number });
    newContact.save().then(() => res.status(201).json({ message: 'Contact added' }))
                     .catch(err => res.status(500).json({ error: 'Error adding contact', details: err.message }));
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
