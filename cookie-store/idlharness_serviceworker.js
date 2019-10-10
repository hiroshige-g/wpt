self.GLOBAL = {
  isWindow: function() { return false; },
  isWorker: function() { return true; },
};
importScripts('/resources/testharness.js',
              '/resources/WebIDLParser.js',
              '/resources/idlharness.js');

promise_test(async t => {
  const urls = ['/interfaces/cookie-store.idl'];
  const [cookie_store] = await Promise.all(
    urls.map(url => fetch(url).then(response => response.text())));

  const idl_array = new IdlArray();

  idl_array.add_untested_idls(
    `[Exposed=(Window,Worker)]
     interface Event {};`);
  idl_array.add_untested_idls(
    `[Exposed=ServiceWorker]
     interface ExtendableEvent : Event {};`);
  idl_array.add_untested_idls('dictionary EventHandler {};');
  idl_array.add_untested_idls('dictionary EventInit {};');
  idl_array.add_untested_idls('dictionary ExtendableEventInit {};');
  idl_array.add_untested_idls(
    `[Exposed=(Window,Worker)]
     interface EventTarget {};`);
  idl_array.add_untested_idls(
    `[Exposed=(Window,Worker), SecureContext]
     interface ServiceWorkerRegistration {};`);
  idl_array.add_untested_idls(
    `[Exposed=ServiceWorker, Global=ServiceWorker]
     interface ServiceWorkerGlobalScope {};`);
  idl_array.add_untested_idls(
    `[Exposed=Window, Global=Window]
     interface Window {};`);

  idl_array.add_idls(cookie_store);

  idl_array.add_objects({
    CookieStore: ["self.cookieStore"],
    ExtendableCookieChangeEvent: [
        "new ExtendableCookieChangeEvent('cookiechange')"],
    ServiceWorkerRegistration: ["self.registration"],
    ServiceWorkerGlobalScope: ["self"],
  });
  idl_array.test();
}, 'Interface test');

done();
