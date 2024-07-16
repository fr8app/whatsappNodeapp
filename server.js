const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { MessagingResponse } = require('twilio').twiml;
const twilio = require('twilio');
const path = require('path');

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const accountSid = 'ACac793f02cf5fd252f8206d87bb06d91a';
const authToken = 'f9eeaad61a3a4adf70f36766191c6cb3';
const client = new twilio(accountSid, authToken);

const employees = [
    { name: 'Nivedita', number: '+919922637115' },
    { name: 'Guillermo', number: '+12019264229' },
    // Add more employees here
];

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

    // Log the request data for debugging
    console.log(`Sending message: ${message} to: ${to}`);

    if (!message || !to) {
        console.error('Message or recipient number is missing');
        return res.status(400).json({ error: 'Message or recipient number is missing' });
    }

    // Send the message to the specified customer/driver number
    client.messages.create({
        body: message,
        from: 'whatsapp:+18434843838',  // Your Twilio WhatsApp number
        to: `whatsapp:${to}`  // The customer's/driver's WhatsApp number
    }).then(sentMessage => {
        // Log the message SID for debugging
        console.log(`Message sent with SID: ${sentMessage.sid}`);

        // Store the outgoing message in the database
        const newMessage = new Message({ from: 'whatsapp:+18434843838', to, body: message });
        newMessage.save().then(() => {
            res.status(200).send('Message sent');
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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const port = 8080; // Change this line to use port 8080
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
