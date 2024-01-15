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
db_apartments.run('CREATE TABLE IF NOT EXISTS apartments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');

app.post('/book', async (req, res) => {
    const { apartment_id, from_date, to_date } = req.body;
    const start_date = new Date(from_date).getTime();
    const end_date = new Date(to_date).getTime();
    
    db_bookings.run('INSERT INTO bookings (apartment_id, from_date, to_date) VALUES (?, ?, ?)', [apartment_id, start_date, end_date], function(err) {
        if (err)
            return res.sendStatus(500);

        const action = {action: "booked_apartment", object: {id: apartment_id, from_date: start_date, to_date: end_date}};
        notifyRabbitMQ(action);

        res.send(action);
    });
});

app.delete('/', async (req, res) => {
    const { booking_id } = req.body;

    db_bookings.run('DELETE FROM bookings WHERE id = ?', [booking_id], (err) => {
        if (err)
            return res.sendStatus(500);
        
        const action = {action: "deleted_booking", object: {id: booking_id}};
        notifyRabbitMQ(action);

        res.send(action);
    });
});

app.get('/list', (req, res) => {
    db_bookings.all('SELECT * FROM bookings', (err, rows) => {
        if (err)
            return res.sendStatus(500);
        else
            return res.send(rows);
    });
});

app.get('/', (req, res) => {
    res.send('Booking service');
});

app.listen(port, () => {
    console.log(`Booking service started at http://localhost:${port}`);
    syncApartments();
    listenForChanges();
});

function addApartment(apartment) {
    db_apartments.run('INSERT INTO apartments (id, name) VALUES (?, ?)', [apartment.id, apartment.name], (err) => {
        if (err)
            console.log(err);
        else
            console.log('Syncing apartments:', apartment);
    });
}

function removeApartment(apartment) {
    db_apartments.run('DELETE FROM apartments WHERE id = ?', [apartment.id], (err) => {
        if (err)
            console.log(err);
        else
            console.log('Syncing apartments:', apartment);
    });
}

async function listenForChanges() {
    const connection = await amqp.connect('amqp://rabbitmq');
    const channel = await connection.createChannel();

    await channel.assertQueue('booking_actions', { durable: true });

    channel.consume('booking_actions', (message) => {
        const data = JSON.parse(message.content.toString());

        switch(data.action) {
            case 'added_apartment':
                addApartment(data.object);
                break;
            case 'removed_apartment':
                removeApartment(data.object);
                break;
        }
    }, { noAck: true });
}

async function notifyRabbitMQ(booking) {
    const connection = await amqp.connect('amqp://rabbitmq');
    const channel = await connection.createChannel();

    await channel.assertQueue('search_actions', 'fanout', { durable: true });
    channel.sendToQueue('search_actions', Buffer.from(JSON.stringify(booking)));

    setTimeout(() => {
        connection.close();
    }, 500);
}

function syncApartments() {
    axios.get('http://apartments:3000/list').then((response) => {
        const apartments = response.data;
        apartments.forEach(apartment => {  
            db_apartments.run('INSERT INTO apartments (id, name) VALUES (?, ?)', [apartment.id, apartment.name], (err) => {
                if (err)
                    console.log(err);
                else
                    console.log('Syncing apartments:', apartment);
            });
        });
    });
}