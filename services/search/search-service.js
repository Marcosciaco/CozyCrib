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

    const start_date = new Date(from_date).getTime();
    const end_date = new Date(to_date).getTime();

    db_bookings.all('SELECT apartment_id FROM bookings WHERE from_date <= ? AND to_date >= ?', [start_date, end_date], (err, rows) => {
        if (err)
            return res.sendStatus(500);
        
        const booked_apartments = rows.map(row => row.apartment_id);
        
        db_apartments.all('SELECT * FROM apartments', (err, rows) => {
            if (err)
                return res.sendStatus(500);

            const available_apartments = rows.filter(row => !booked_apartments.includes(row.id));

            res.send(available_apartments);
        });
    });
});

app.get('/', (req, res) => {
    res.send('Search service');
});

app.listen(port, () => {
    console.log(`Search service started at http://localhost:${port}`);
    syncApartments();
    syncBookings();
    listenToChanges();
});

function syncApartments() {
    axios.get('http://apartments:3000/list').then(response => {
        response.data.forEach(apartment => {
            db_apartments.run('INSERT INTO apartments (id, name) VALUES (?, ?)', [apartment.id, apartment.name], function(err) {
                if (err)
                    console.log(err);
                else
                    console.log('Syncing apartments:', apartment);
            });
        });
    });
}

function syncBookings() {
    axios.get('http://bookings:3000/list').then(response => {
        response.data.forEach(booking => {
            db_bookings.run('INSERT INTO bookings (apartment_id, from_date, to_date) VALUES (?, ?, ?)', [booking.apartment_id, booking.from_date, booking.to_date], function(err) {
                if (err)
                    console.log(err);
                else
                    console.log('Syncing bookings:', booking);
            });
        });
    });
}

function addApartment(apartment) {
    db_apartments.run('INSERT INTO apartments (id, name) VALUES (?, ?)', [apartment.id, apartment.name], function(err) {
        if (err)
            console.log(err);
        else  
            console.log('Added apartment:', data);
    });
}

function removeApartment(apartment) {
    db_apartments.run('DELETE FROM apartments WHERE id = ?', [apartment.id], function(err) {
        if (err)
            console.log(err);
        else
            console.log('Removed apartment:', data);
    });
}

function bookApartment(apartment) {
    db_apartments.run('UPDATE apartments SET booked = 1 WHERE id = ?', [apartment.id], function(err) {
        if (err)
            console.log(err);
        
        db_bookings.run('INSERT INTO bookings (apartment_id, from_date, to_date) VALUES (?, ?, ?)', [apartment.id, apartment.from_date, apartment.to_date], function(err) {
            if (err)
                console.log(err);
            else
                console.log('Added booking:', data);
        });
    });
}

function cancelBooking(booking) {
    console.log('Cancelling booking:', booking);
    db_bookings.run('DELETE FROM bookings WHERE id = ?', [booking.id], function(err) {
        if (err)
            return res.sendStatus(500);
        else
            console.log('Removed booking:', booking);
    });
}

async function listenToChanges() {
    const connection = await amqp.connect('amqp://rabbitmq');
    const channel = await connection.createChannel();
    await channel.assertQueue('search_actions', { durable: true });

    channel.consume('search_actions', (message) => {
        const data = JSON.parse(message.content.toString());
        switch(data.action) {
            case "added_apartment":
                addApartment(data.object);
                break;
            case "removed_apartment":
                removeApartment(data.object);
                break;
            case "booked_apartment":
                bookApartment(data.object);
                break;
            case "booking_cancelled":
                cancelBooking(data.object);
                break;
        }
    }, { noAck: true });
}