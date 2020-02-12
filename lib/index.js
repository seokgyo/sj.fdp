const worker = new Worker('./worker.js', { type: 'module' });

worker.postMessage('ping');

worker.onmessage = (e) => {
  console.log('Message received from worker', e.data);
};
