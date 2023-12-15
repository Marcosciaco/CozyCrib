const amqp = require('amqplib');

async function consumeMessage() {
  const connection = await amqp.connect('amqp://rabbitmq');
  const channel = await connection.createChannel();

  const queueName = 'messages';

  await channel.assertQueue(queueName, { durable: false });

  console.log(`Waiting for messages. To exit, press CTRL+C`);

  channel.consume(
    queueName,
    (message) => {
      console.log(`Received message: ${message.content.toString()}`);
    },
    { noAck: true }
  );
}

consumeMessage();
