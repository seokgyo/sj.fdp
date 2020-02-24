import actions from './actions';
import MessageHandler from './MessageHandler';

const messageHandler = new MessageHandler(
  'main', 'worker', new Worker('./worker.js', { type: 'module' }),
);

// eslint-disable-next-line import/prefer-default-export
export const load = (url) => {
  messageHandler
    .sendWithPromise(actions.GetDocRequest, {
      source: { url },
    })
    .then(console.log);
};

load('test.pdf');
