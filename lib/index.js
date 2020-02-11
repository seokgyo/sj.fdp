const worker = new Worker('worker.bundle.js');

worker.postMessage('ping');

worker.onmessage = (e) => {
  console.log('Message received from worker', e.data);
};
