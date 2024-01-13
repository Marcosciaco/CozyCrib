const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const port = 3000;
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send('API Gateway');
});

app.listen(port, () => {
    console.log(`API Gateway started at http://localhost:${port}`);
});

app.post('/apartment/add', async (req, res) => {

    console.log('Adding apartment:', req.body.name);

    const response = await axios.post('http://apartments:3000/add', req.body);
    res.send(response.data);
});

app.delete('/apartment', async (req, res) => {
    const response = await axios.delete('http://apartments:3000/', {data: req.body});
    res.send(response.data);
});

app.get('/apartment/list', async (req, res) => {
    const response = await axios.get('http://apartments:3000/list');
    res.send(response.data);
});

app.post('/booking/book', async (req, res) => {
    const response = await axios.post('http://bookings:3000/book', req.body);
    res.send(response.data);
});

app.get('/booking/list', async (req, res) => {
    const response = await axios.get('http://bookings:3000/list');
    res.send(response.data);
});

app.post('/search', async (req, res) => {
    const response = await axios.post('http://searches:3000/search', req.body);
    res.send(response.data);
});

