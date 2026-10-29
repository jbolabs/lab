/** A deferred promise whose resolver is registered synchronously by the fixture. */
export function deferredPromise(initialize) {
	const { promise, reject, resolve } = Promise.withResolvers();
	try {
		initialize(resolve, reject);
	} catch (error) {
		reject(error);
	}
	return promise;
}
