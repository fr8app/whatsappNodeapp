const express = require('express');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml;
const twilio = require('twilio');
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

// Endpoint to handle incoming messages from customers/drivers
app.post('/incoming', (req, res) => {
    const message = req.body.Body;
    const from = req.body.From;

    // Log the message or process it as needed
    console.log(`Received message from ${from}: ${message}`);

    // Forward the message to all employees
    employees.forEach(employee => {
        client.messages.create({
            body: `Message from ${from}: ${message}`,
            from: 'whatsapp:+YourTwilioNumber', // Your Twilio WhatsApp number
            to: `whatsapp:${employee.number}`
        }).then(message => console.log(message.sid));
    });

    res.status(200).send('Message forwarded');
});

// Endpoint for employees to send messages to customers/drivers
app.post('/send', (req, res) => {
    const { message, to } = req.body;

    // Send the message to the specified customer/driver number
    client.messages.create({
        body: message,
        from: 'whatsapp:+YourTwilioNumber',  // Your Twilio WhatsApp number
        to: `whatsapp:${to}`  // The customer's/driver's WhatsApp number
    }).then(message => {
        res.status(200).send('Message sent');
    }).catch(error => {
        res.status(500).send('Error sending message');
    });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

const port = 8080; // Change this line to use port 8080
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
