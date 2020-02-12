import MessageHandler from './MessageHandler';

const handler = new MessageHandler('worker', 'main', self);

handler.on('ping', (data) => {
  console.log('got ping:', data);
  handler.send('pong', 'world');
});
