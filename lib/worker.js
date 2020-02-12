import actions from './actions';
import MessageHandler from './MessageHandler';

// eslint-disable-next-line no-restricted-globals
const handler = new MessageHandler('worker', 'main', self);

handler.on(actions.GetDocRequest, (data) => data.source.url);
