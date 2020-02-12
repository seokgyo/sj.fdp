import MessageHandler from './MessageHandler';

const worker = new Worker('./worker.js', { type: 'module' });
const messageHandler = new MessageHandler('main', 'worker', worker);

messageHandler.send('ping', 'hello');

messageHandler.on('pong', (data) => {
  console.log('got pong:', data);
});
