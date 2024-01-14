const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const amqp = require('amqplib');
const axios = require('axios');

const app = express();
const port = 3000;
app.use(bodyParser.json());

const db_bookings = new sqlite3.Database('./bookings.db');
const db_apartments = new sqlite3.Database('./apartments.db');

db_bookings.run('CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, apartment_id INTEGER, from_date REAL, to_date REAL)');
db_apartments.run('CREATE TABLE IF NOT EXISTS apartments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, booked INTEGER DEFAULT 0)');

app.post('/book', async (req, res) => {
    const { apartment_id, from_date, to_date } = req.body;

    console.log('Booking apartment:', apartment_id, from_date, to_date);

    const start_date = new Date(from_date).getTime();
    const end_date = new Date(to_date).getTime();
    
    console.log(start_date, end_date);

    db_bookings.run('INSERT INTO bookings (apartment_id, from_date, to_date) VALUES (?, ?, ?)', [apartment_id, start_date, end_date], function(err) {
        if (err) {
            console.log(err);
            return res.sendStatus(500);
        }

        db_apartments.run('UPDATE apartments SET booked = 1 WHERE id = ?', [apartment_id], function(err) {
            if (err) {
                console.log(err);
                return res.sendStatus(500);
            }

            const action = {action: "booked_apartment", object: {id: apartment_id, from_date: start_date, to_date: end_date}};

            notifyRabbitMQ(action);

            res.send(action);
        });
    });
});

app.get('/list', (req, res) => {
    db_bookings.all('SELECT * FROM bookings', (err, rows) => {
        if (err) {
            console.log(err);
            return res.sendStatus(500);
        }

        res.send(rows);
    });
});

app.get('/', (req, res) => {
    res.send('Booking service');
});

app.get('/listen', (req, res) => {
    listenForApartmentsInRabbitMQ();
    res.send('Listening for apartments');
});

app.listen(port, () => {
    console.log(`Booking service started at http://localhost:${port}`);
    syncApartments();
});

async function listenForApartmentsInRabbitMQ() {
    const connection = await amqp.connect('amqp://rabbitmq');
    const channel = await connection.createChannel();

    const queueName = 'booking_actions';

    await channel.assertQueue(queueName, { durable: true });

    channel.consume(queueName, (message) => {
        const data = JSON.parse(message.content.toString());
        console.log('Received apartment:', data);

        if (data.action == 'added_apartment') {
            db_apartments.run('INSERT INTO apartments (id, name) VALUES (?, ?)', [data.object.id, data.object.name], (err) => {
                if (err) {
                    console.log(err);
                    return res.sendStatus(500);
                }
            });
        } else if (data.action == 'removed_apartment') {
            db_apartments.run('DELETE FROM apartments WHERE id = ?', [data.object.id], (err) => {
                if (err) {
                    console.log(err);
                    return res.sendStatus(500);
                }
            });
        }
    }, { noAck: true });
}

async function notifyRabbitMQ(booking) {
    const connection = await amqp.connect('amqp://rabbitmq');
    const queueName = 'search_actions';

    const channel = await connection.createChannel();

    await channel.assertQueue(queueName, 'fanout', { durable: true });

    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(booking)));

    console.log('Notified RabbitMQ:', booking);

    setTimeout(() => {
        connection.close();
    }, 500);
}

function syncApartments() {
    axios.get('http://apartments:3000/list').then((response) => {
        const apartments = response.data;

        console.log('Syncing apartments:', apartments);
        apartments.forEach(apartment => {  
            db_apartments.run('INSERT INTO apartments (id, name) VALUES (?, ?)', [apartment.id, apartment.name], (err) => {
                if (err) {
                    console.log(err);
                    return res.sendStatus(500);
                }
            });
        });
    });
}