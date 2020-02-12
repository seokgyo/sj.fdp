import actions from './actions';
import MessageHandler from './MessageHandler';

const worker = new Worker('./worker.js', { type: 'module' });
const messageHandler = new MessageHandler('main', 'worker', worker);

// eslint-disable-next-line import/prefer-default-export
export const load = (url) => {
  messageHandler
    .sendWithPromise(actions.GetDocRequest, {
      source: { url },
    })
    .then(console.log);
};

load('test.pdf');
