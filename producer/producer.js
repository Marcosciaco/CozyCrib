const amqp = require('amqplib');

async function produceMessage() {
  const connection = await amqp.connect('amqp://rabbitmq');
  const channel = await connection.createChannel();

  const queueName = 'messages';
  const message = 'Hello from producer!';

  await channel.assertQueue(queueName, { durable: false });
  channel.sendToQueue(queueName, Buffer.from(message));

  console.log(`Sent: ${message}`);

  setTimeout(() => {
    connection.close();
    process.exit(0);
  }, 500);
}

produceMessage();
