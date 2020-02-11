onmessage = (e) => {
  console.log('Worker: Message received from main script', e.data);
  postMessage('pong');
};
