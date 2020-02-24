import { createPromiseCapability } from './util';
import {
  AbortError, MissingPDFError, UnexpectedResponseError, UnknownError,
} from './errors';

const CallbackKind = {
  UNKNOWN: 0,
  DATA: 1,
  ERROR: 2,
};

const StreamKind = {
  UNKNOWN: 0,
  CANCEL: 1,
  CANCEL_COMPLETE: 2,
  CLOSE: 3,
  ENQUEUE: 4,
  ERROR: 5,
  PULL: 6,
  PULL_COMPLETE: 7,
  START_COMPLETE: 8,
};

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
    this.streamId = 1;
    this.streamSinks = Object.create(null);
    this.streamControllers = Object.create(null);
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
      this.comObj.postMessage({
        sourceName: this.sourceName,
        targetName: this.targetName,
        action: actionName,
        callbackId,
        data,
      }, transfers);
    } catch (ex) {
      capability.reject(ex);
    }
    return capability.promise;
  }

  sendWithStream(actionName, data, queueingStrategy, transfers) {
    // eslint-disable-next-line no-plusplus
    const streamId = this.streamId++;
    const message = {
      sourceName: this.sourceName,
      targetName: this.targetName,
      streamId,
    };

    return new ReadableStream({
      start: (controller) => {
        const startCapability = createPromiseCapability();
        this.streamControllers[streamId] = {
          controller,
          startCall: startCapability,
          pullCall: null,
          cancelCall: null,
          isClosed: false,
        };
        this.comObj.postMessage({
          ...message,
          action: actionName,
          data,
          desiredSize: controller.desiredSize,
        }, transfers);
        // Return Promise for Async process, to signal success/failure.
        return startCapability.promise;
      },
      pull: (controller) => {
        const pullCapability = createPromiseCapability();
        this.streamControllers[streamId].pullCall = pullCapability;
        this.comObj.postMessage({
          ...message,
          stream: StreamKind.PULL,
          desiredSize: controller.desiredSize,
        });
        // Returning Promise will not call "pull"
        // again until current pull is resolved.
        return pullCapability.promise;
      },
      cancel: (reason) => {
        const cancelCapability = createPromiseCapability();
        this.streamControllers[streamId].cancelCall = cancelCapability;
        this.streamControllers[streamId].isClosed = true;
        this.comObj.postMessage({
          ...message,
          stream: StreamKind.CANCEL,
          reason: wrapReason(reason),
        });
        // Return Promise to signal success or failure.
        return cancelCapability.promise;
      },
    }, queueingStrategy);
  }

  onComObjOnMessage = (event) => {
    const { data } = event;
    if (data.targetName !== this.sourceName) {
      return;
    }
    if (data.stream) {
      this.processStreamMessage(data);
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
    if (data.streamId) {
      this.createStreamSink(data);
      return;
    }
    action(data.data);
  }

  processStreamMessage(data) {
    const { streamId } = data;
    const message = {
      sourceName: this.sourceName,
      targetName: data.sourceName,
      streamId,
    };

    switch (data.stream) {
      case StreamKind.START_COMPLETE:
        if (data.success) {
          this.streamControllers[streamId].startCall.resolve();
        } else {
          this.streamControllers[streamId].startCall.reject(
            wrapReason(data.reason),
          );
        }
        break;
      case StreamKind.PULL_COMPLETE:
        if (data.success) {
          this.streamControllers[streamId].pullCall.resolve();
        } else {
          this.streamControllers[streamId].pullCall.reject(
            wrapReason(data.reason),
          );
        }
        break;
      case StreamKind.PULL: {
        // Ignore any pull after close is called.
        if (!this.streamSinks[streamId]) {
          this.comObj.postMessage({
            ...message,
            stream: StreamKind.PULL_COMPLETE,
            success: true,
          });
          break;
        }
        // Pull increases the desiredSize property of sink,
        // so when it changes from negative to positive,
        // set ready property as resolved promise.
        if (this.streamSinks[streamId].desiredSize <= 0 && data.desiredSize > 0) {
          this.streamSinks[streamId].sinkCapability.resolve();
        }
        // Reset desiredSize property of sink on every pull.
        this.streamSinks[streamId].desiredSize = data.desiredSize;
        const { onPull } = this.streamSinks[streamId];
        new Promise((resolve) => resolve(onPull && onPull()))
          .then(() => this.comObj.postMessage({
            ...message,
            stream: StreamKind.PULL_COMPLETE,
            success: true,
          }))
          .catch((reason) => this.comObj.postMessage({
            ...message,
            stream: StreamKind.PULL_COMPLETE,
            reason: wrapReason(reason),
          }));
        break;
      }
      case StreamKind.ENQUEUE:
        if (this.streamControllers[streamId].isClosed) {
          break;
        }
        this.streamControllers[streamId].controller.enqueue(data.chunk);
        break;
      case StreamKind.CLOSE:
        if (this.streamControllers[streamId].isClosed) {
          break;
        }
        this.streamControllers[streamId].isClosed = true;
        this.streamControllers[streamId].controller.close();
        this.deleteStreamController(streamId);
        break;
      case StreamKind.ERROR:
        this.streamControllers[streamId].controller.error(
          wrapReason(data.reason),
        );
        this.deleteStreamController(streamId);
        break;
      case StreamKind.CANCEL_COMPLETE:
        if (data.success) {
          this.streamControllers[streamId].cancelCall.resolve();
        } else {
          this.streamControllers[streamId].cancelCall.reject(
            wrapReason(data.reason),
          );
        }
        this.deleteStreamController(streamId);
        break;
      case StreamKind.CANCEL: {
        if (!this.streamSinks[streamId]) {
          break;
        }
        const { onCancel } = this.streamSinks[streamId];
        new Promise((resolve) => resolve(onCancel && onCancel(wrapReason(data.reason))))
          .then(() => this.comObj.postMessage({
            ...message,
            stream: StreamKind.CANCEL_COMPLETE,
            success: true,
          }))
          .catch((reason) => this.comObj.postMessage({
            ...message,
            stream: StreamKind.CANCEL_COMPLETE,
            reason: wrapReason(reason),
          }));
        this.streamSinks[streamId].sinkCapability.reject(
          wrapReason(data.reason),
        );
        this.streamSinks[streamId].isCancelled = true;
        delete this.streamSinks[streamId];
        break;
      }
      default:
        throw new Error('Unexpected stream case');
    }
  }

  createStreamSink(data) {
    const self = this;
    const action = this.actionHandler[data.action];
    const { streamId } = data;
    const sourceName = this.sourceName;
    const targetName = data.sourceName;
    const comObj = this.comObj;

    const streamSink = {
      enqueue(chunk, size = 1, transfers) {
        if (this.isCancelled) {
          return;
        }
        const lastDesiredSize = this.desiredSize;
        this.desiredSize -= size;
        // Enqueue decreases the desiredSize property of sink,
        // so when it changes from positive to negative,
        // set ready as unresolved promise.
        if (lastDesiredSize > 0 && this.desiredSize <= 0) {
          this.sinkCapability = createPromiseCapability();
          this.ready = this.sinkCapability.promise;
        }
        comObj.postMessage({
          sourceName,
          targetName,
          stream: StreamKind.ENQUEUE,
          streamId,
          chunk,
        }, transfers);
      },
      close() {
        if (this.isCancelled) {
          return;
        }
        this.isCancelled = true;
        comObj.postMessage({
          sourceName,
          targetName,
          stream: StreamKind.CLOSE,
          streamId,
        });
        delete self.streamSinks[streamId];
      },
      error(reason) {
        if (this.isCancelled) {
          return;
        }
        this.isCancelled = true;
        comObj.postMessage({
          sourceName,
          targetName,
          stream: StreamKind.ERROR,
          streamId,
          reason: wrapReason(reason),
        });
      },
      sinkCapability: createPromiseCapability(),
      onPull: null,
      onCancel: null,
      isCancelled: false,
      desiredSize: data.desiredSize,
      ready: null,
    };

    streamSink.sinkCapability.resolve();
    streamSink.ready = streamSink.sinkCapability.promise;
    this.streamSinks[streamId] = streamSink;
    new Promise((resolve) => resolve(action(data.data, streamSink)))
      .then(() => comObj.postMessage({
        sourceName,
        targetName,
        stream: StreamKind.START_COMPLETE,
        streamId,
        success: true,
      }))
      .catch((reason) => comObj.postMessage({
        sourceName,
        targetName,
        stream: StreamKind.START_COMPLETE,
        streamId,
        reason: wrapReason(reason),
      }));
  }

  async deleteStreamController(streamId) {
    // Delete the `streamController` only when the start, pull, and cancel
    // capabilities have settled, to prevent `TypeError`s.
    await Promise.allSettled([
      this.streamControllers[streamId].startCall,
      this.streamControllers[streamId].pullCall,
      this.streamControllers[streamId].cancelCall,
    ].map((capability) => capability && capability.promise));
    delete this.streamControllers[streamId];
  }

  destroy() {
    this.comObj.removeEventListener('message', this.onComObjOnMessage);
  }
}
