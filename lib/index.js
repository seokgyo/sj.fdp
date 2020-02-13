import actions from './actions';
import MessageHandler from './MessageHandler';

const worker = new Worker('./worker.js', { type: 'module' });
const messageHandler = new MessageHandler('main', 'worker', worker);

const buf = new ArrayBuffer(8);
console.log('main: before:', buf);
messageHandler.send('w/o transfer', { buf });
console.log('main: w/o transfer: after:', buf);
messageHandler.send('w/ transfer', { buf }, [buf]);
console.log('main: w/ transfer: after:', buf);

messageHandler.on('transfer', console.log);

// eslint-disable-next-line import/prefer-default-export
export const load = (url) => {
  messageHandler
    .sendWithPromise(actions.GetDocRequest, {
      source: { url },
    })
    .then(console.log);
};

load('test.pdf');
