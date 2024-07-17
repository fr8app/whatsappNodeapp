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

// Endpoint to fetch unique contacts
app.get('/contacts', (req, res) => {
    Message.distinct('from')
        .then(contacts => res.json(contacts))
        .catch(err => res.status(500).send(err));
});

// Endpoint to fetch messages for a specific contact
app.get('/messages/:number', (req, res) => {
    const { number } = req.params;
    Message.find({ $or: [{ from: number }, { to: number }] })
        .sort({ date: -1 })
        .then(messages => res.json(messages))
        .catch(err => res.status(500).send(err));
});

// Other endpoints...

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
