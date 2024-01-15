const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const amqp = require('amqplib');

const app = express();
const port = 3000;
app.use(bodyParser.json());

const db = new sqlite3.Database('./apartments.db');

db.run('CREATE TABLE IF NOT EXISTS apartments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');

app.post('/add', async (req, res) => {
    const { name } = req.body;

    db.run('INSERT INTO apartments (name) VALUES (?)', [name], function(err) {
        if (err)
            return res.sendStatus(500);

        const action = {action: "added_apartment", object: {id: this.lastID, name: name}};
        notifyRabbitMQ(action);

        res.send(action);
    });
});

app.delete('/', async (req, res) => {
    const { id } = req.body;
    
    db.run('DELETE FROM apartments WHERE id = ?', [id], function(err) {
        if (err)
            return res.sendStatus(500);
        
        const action = {action: "removed_apartment", object: {id: id}};
        notifyRabbitMQ(action);

        res.send(action);
    });
});

app.get('/list', (req, res) => {
    db.all('SELECT * FROM apartments', (err, rows) => {
        if (err)
            return res.sendStatus(500);

        res.send(rows);
    });
});

app.get('/', (req, res) => {
    res.send('Apartment service');
});

app.listen(port, () => {
    console.log(`Apartment service started at http://localhost:${port}`);
});

async function notifyRabbitMQ(apartment) {
    const connection = await amqp.connect('amqp://rabbitmq');
    const channel = await connection.createChannel();

    await channel.assertExchange('actions', 'fanout', { durable: true });
    const q_b = await channel.assertQueue('booking_actions', { durable: true });
    const q_s = await channel.assertQueue('search_actions', { durable: true });
    await channel.bindQueue(q_b.queue, 'actions', '');
    await channel.bindQueue(q_s.queue, 'actions', '');

    channel.publish('actions', '', Buffer.from(JSON.stringify(apartment)));

    setTimeout(() => {
        connection.close();
    }, 500);
}