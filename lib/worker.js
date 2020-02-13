import actions from './actions';
import MessageHandler from './MessageHandler';

// eslint-disable-next-line no-restricted-globals
const handler = new MessageHandler('worker', 'main', self);

handler.on(actions.GetDocRequest, (data) => data.source.url);

handler.on('w/o transfer', (data) => {
  console.log('worker: w/o transfer:', data.buf);
});

handler.on('w/ transfer', (data) => {
  console.log('worker: w/ transfer: before:', data.buf);
  handler.send('transfer', { buf: data.buf }, [data.buf]);
  console.log('worker: w/ transfer: after:', data.buf);
});
