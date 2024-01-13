const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const amqp = require('amqplib');
const axios = require('axios');

const app = express();
const port = 3000;
app.use(bodyParser.json());

const db_searches = new sqlite3.Database('search.db');
const db_apartments = new sqlite3.Database('apartments.db');
const db_bookings = new sqlite3.Database('bookings.db');

db_searches.run('CREATE TABLE IF NOT EXISTS apartments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
db_apartments.run('CREATE TABLE IF NOT EXISTS apartments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, booked INTEGER DEFAULT 0)');
db_bookings.run('CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, apartment_id INTEGER, from_date REAL, to_date REAL)');

app.post('/search', async (req, res) => {
    const { from_date, to_date } = req.body;

    console.log('Searching apartments:', from_date, to_date);

    const start_date = new Date(from_date);
    const end_date = new Date(to_date);

    console.log(start_date.toDateString(), end_date.toDateString());

    db_bookings.all('SELECT apartment_id FROM bookings WHERE to_date <= ? AND from_date >= ?', [start_date.getTime(), end_date.getTime()], (err, rows) => {
        if (err) {
            console.log(err);
            return res.sendStatus(500);
        }

        const booked_apartments = rows.map(row => row.apartment_id);

        db_apartments.all('SELECT * FROM apartments WHERE booked = 0', (err, rows) => {
            if (err) {
                console.log(err);
                return res.sendStatus(500);
            }

            const available_apartments = rows.filter(row => !booked_apartments.includes(row.id));

            res.send(available_apartments);
        });
    });
});

app.get('/', (req, res) => {
    res.send('Search service');
});

app.get('/listen', (req, res) => {
    listenForApartmentsInRabbitMQ();
    res.send('Listening for apartments');
});

app.listen(port, () => {
    console.log(`Search service started at http://localhost:${port}`);
    syncApartments();
    syncBookings();
});

function syncApartments() {
    axios.get('http://apartments:3000/list').then(response => {
        response.data.forEach(apartment => {
            db_apartments.run('INSERT INTO apartments (id, name) VALUES (?, ?)', [apartment.id, apartment.name], function(err) {
                if (err) {
                    console.log(err);
                    return res.sendStatus(500);
                }
            });
        });
    });
}

function syncBookings() {
    axios.get('http://bookings:3000/list').then(response => {
        response.data.forEach(booking => {
            db_bookings.run('INSERT INTO bookings (apartment_id, from_date, to_date) VALUES (?, ?, ?)', [booking.apartment_id, booking.from_date, booking.to_date], function(err) {
                if (err) {
                    console.log(err);
                    return res.sendStatus(500);
                }
            });
        });
    });
}

async function listenForApartmentsInRabbitMQ() {
    const connection = await amqp.connect('amqp://rabbitmq');
    const channel = await connection.createChannel();

    const queueName = 'search_actions';

    await channel.assertQueue(queueName, { durable: true });

    channel.consume(queueName, (message) => {
        const data = JSON.parse(message.content.toString());
        console.log('Received apartment:', data);

        switch(data.action) {
            case "added_apartment":
                db_apartments.run('INSERT INTO apartments (id, name) VALUES (?, ?)', [data.object.id, data.object.name], function(err) {
                    if (err) {
                        console.log(err);
                        return res.sendStatus(500);
                    } else {    
                        console.log('Added apartment:', data);
                    }
                });
                break;
            case "removed_apartment":
                db_apartments.run('DELETE FROM apartments WHERE id = ?', [data.object.id], function(err) {
                    if (err) {
                        console.log(err);
                        return res.sendStatus(500);
                    } else {
                        console.log('Removed apartment:', data);
                    }
                });
                break;
            case "booked_apartment":
                db_apartments.run('UPDATE apartments SET booked = 1 WHERE id = ?', [data.object.id], function(err) {
                    if (err) {
                        console.log(err);
                        return res.sendStatus(500);
                    }
                    db_bookings.run('INSERT INTO bookings (apartment_id, from_date, to_date) VALUES (?, ?, ?)', [data.object.id, data.object.from_date, data.object.to_date], function(err) {
                        if (err) {
                            console.log(err);
                            return res.sendStatus(500);
                        } else {
                            console.log('Added booking:', data);
                        }
                    });
                });
                break;
        }
    }, { noAck: true });
}