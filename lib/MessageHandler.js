import { createPromiseCapability } from './util';
import {
  AbortError, MissingPDFError, UnexpectedResponseError, UnknownError,
} from './errors';

const CallbackKind = {
  UNKNOWN: 0,
  DATA: 1,
  ERROR: 2,
};

// const StreamKind = {
//   UNKNOWN: 0,
//   CANCEL: 1,
//   CANCEL_COMPLETE: 2,
//   CLOSE: 3,
//   ENQUEUE: 4,
//   ERROR: 5,
//   PULL: 6,
//   PULL_COMPLETE: 7,
//   START_COMPLETE: 8,
// };

function wrapReason(reason) {
  if (typeof reason !== 'object' || reason === null) {
    return reason;
  }
  switch (reason.name) {
    case 'AbortError':
      return new AbortError(reason.message);
    case 'MissingPDFError':
      return new MissingPDFError(reason.message);
    case 'UnexpectedResponseError':
      return new UnexpectedResponseError(reason.message, reason.status);
    case 'UnknownError':
      return new UnknownError(reason.message, reason.details);
    default:
      return new UnknownError(reason.message, reason.toString());
  }
}

export default class MessageHandler {
  constructor(sourceName, targetName, comObj) {
    this.sourceName = sourceName;
    this.targetName = targetName;
    this.comObj = comObj;
    this.callbackId = 1;
    this.postMessageTransfers = true;
    this.callbackCapabilities = Object.create(null);
    this.actionHandler = Object.create(null);

    comObj.addEventListener('message', this.onComObjOnMessage);
  }

  on(actionName, handler) {
    const ah = this.actionHandler;
    if (ah[actionName]) {
      throw new Error(`There is already an actionName called "${actionName}"`);
    }
    ah[actionName] = handler;
  }

  send(actionName, data, transfers) {
    this.comObj.postMessage(
      {
        sourceName: this.sourceName,
        targetName: this.targetName,
        action: actionName,
        data,
      },
      transfers,
    );
  }

  sendWithPromise(actionName, data, transfers) {
    // eslint-disable-next-line no-plusplus
    const callbackId = this.callbackId++;
    const capability = createPromiseCapability();
    this.callbackCapabilities[callbackId] = capability;
    try {
      this.comObj.postMessage(
        {
          sourceName: this.sourceName,
          targetName: this.targetName,
          action: actionName,
          callbackId,
          data,
        },
        transfers,
      );
    } catch (ex) {
      capability.reject(ex);
    }
    return capability.promise;
  }

  onComObjOnMessage(event) {
    const { data } = event;
    if (data.targetName !== this.sourceName) {
      return;
    }
    if (data.callback) {
      const { callbackId } = data;
      const capability = this.callbackCapabilities[callbackId];
      if (!capability) {
        throw new Error(`Cannot resolve callback ${callbackId}`);
      }
      delete this.callbackCapabilities[callbackId];

      if (data.callback === CallbackKind.DATA) {
        capability.resolve(data.data);
      } else if (data.callback === CallbackKind.ERROR) {
        capability.reject(wrapReason(data.reason));
      } else {
        throw new Error('Unexpected callback case');
      }
      return;
    }
    const action = this.actionHandler[data.action];
    if (!action) {
      throw new Error(`Unknown action from worker: ${data.action}`);
    }
    if (data.callbackId) {
      const message = {
        sourceName: this.sourceName,
        targetName: data.sourceName,
        callbackId: data.callbackId,
      };
      new Promise((resolve) => {
        resolve(action(data.data));
      }).then(
        (result) => this.comObj.postMessage({
          ...message,
          callback: CallbackKind.DATA,
          data: result,
        }),
        (reason) => this.comObj.postMessage({
          ...message,
          callback: CallbackKind.ERROR,
          reason: wrapReason(reason),
        }),
      );
      return;
    }
    action(data.data);
  }

  destroy() {
    this.comObj.removeEventListener('message', this.onComObjOnMessage);
  }
}
