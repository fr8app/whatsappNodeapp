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
const authToken = 'f9c7108ef4f31405894bbaa266d507a3';
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
    const newMessage = new Message({ from, body: message, to: 'whatsapp:+YourTwilioNumber' });
    newMessage.save().then(() => {
        // Forward the message to all employees
        employees.forEach(employee => {
            client.messages.create({
                body: `Message from ${from}: ${message}`,
                from: 'whatsapp:+YourTwilioNumber', // Your Twilio WhatsApp number
                to: `whatsapp:${employee.number}`
            }).then(message => console.log(message.sid));
        });

        const twiml = new MessagingResponse();
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(twiml.toString());
    }).catch(err => res.status(500).send(err));
});

// Endpoint for employees to send messages to customers/drivers
app.post('/send', (req, res) => {
    const { message, to } = req.body;

    // Send the message to the specified customer/driver number
    client.messages.create({
        body: message,
        from: 'whatsapp:+18434843838',  // Your Twilio WhatsApp number
        to: `whatsapp:${to}`  // The customer's/driver's WhatsApp number
    }).then(sentMessage => {
        // Store the outgoing message in the database
        const newMessage = new Message({ from: 'whatsapp:+18434843838', to, body: message });
        newMessage.save().then(() => res.status(200).send('Message sent'));
    }).catch(error => {
        res.status(500).send('Error sending message');
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
