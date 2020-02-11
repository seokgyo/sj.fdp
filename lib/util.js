// eslint-disable-next-line import/prefer-default-export
export const createPromiseCapability = () => {
  const capability = Object.create(null);
  let isSettled = false;

  Object.defineProperty(capability, 'settled', {
    get() {
      return isSettled;
    },
  });
  capability.promise = new Promise((resolve, reject) => {
    capability.resolve = (data) => {
      isSettled = true;
      resolve(data);
    };
    capability.reject = (reason) => {
      isSettled = true;
      reject(reason);
    };
  });
  return capability;
};
