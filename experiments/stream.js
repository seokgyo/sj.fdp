const readableStream = new ReadableStream({
  start(c) {
    console.log('start: desiredSize: ', c.desiredSize);
    c.enqueue(['start1', 'start2']);
    console.log('start after enqueue: desiredSize: ', c.desiredSize);
  },
  pull(c) {
    console.log('pull: desiredSize: ', c.desiredSize);
    c.enqueue('pull');
    console.log('pull after enqueue: desiredSize: ', c.desiredSize);
  },
  cancel(reason) {
    console.log('cancel: ', reason);
  },
});

const reader = readableStream.getReader();

console.log('call reads');
Promise.all([
  reader.read().then((r) => console.log('read 1: ', r)),
  reader.read().then((r) => console.log('read 2: ', r)),
  reader.read().then((r) => console.log('read 3: ', r)),
]).then(() => {
  console.log('call quit');
  return reader.cancel('quit');
}).then(() => reader.read())
  .then((r) => console.log('after cancel: ', r));
