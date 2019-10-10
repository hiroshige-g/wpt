'use strict';

// This script depends on the following scripts:
//    /native-file-system/resources/messaging-helpers.js
//    /native-file-system/resources/messaging-blob-helpers.js
//    /native-file-system/resources/messaging-serialize-helpers.js
//    /native-file-system/resources/test-helpers.js
//    /service-workers/service-worker/resources/test-helpers.sub.js

// Tests sending an array of FileSystemHandles to |target| with postMessage().
// The array includes both FileSystemFileHandles and FileSystemDirectoryHandles.
// After receiving the message, |target| accesses all cloned handles by
// serializing the properties of each handle to a JavaScript object.
//
// |target| then responds with the resulting array of serialized handles.  The
// response also includes the array of cloned handles, which creates more
// clones.  After receiving the response, this test runner verifies that both
// the serialized handles and the cloned handles contain the expected properties.
async function do_post_message_test(
  test, root_dir, receiver, target, target_origin) {
  // Create and send the handles to |target|.
  const handles =
    await create_file_system_handles(test, root_dir, target, target_origin);
  target.postMessage(
    { type: 'receive-file-system-handles', cloned_handles: handles },
    target_origin);

  // Wait for |target| to respond with results.
  const event_watcher = new EventWatcher(test, receiver, 'message');
  const message_event = await event_watcher.wait_for('message');
  const response = message_event.data;

  assert_equals(response.type, 'receive-serialized-file-system-handles',
    'The test runner must receive a "serialized-file-system-handles" ' +
    `message response. Actual response: ${response}`);

  // Verify the results.
  const expected_serialized_handles = await serialize_handles(handles);

  assert_equals_serialized_handles(
    response.serialized_handles, expected_serialized_handles);

  await assert_equals_cloned_handles(response.cloned_handles, handles);
}

// Runs the same test as do_post_message_test(), but uses a MessagePort.
// This test starts by establishing a message channel between the test runner
// and |target|.  Afterwards, the test sends FileSystemHandles through the
// message port channel.
async function do_message_port_test(test, root_dir, target, target_origin) {
  const message_port = create_message_channel(target, target_origin);
  await do_post_message_test(
    test, root_dir, /*receiver=*/message_port, /*target=*/message_port);
}

directory_test(async (t, root_dir) => {
  const iframe = await add_iframe(t, { src: kDocumentMessageTarget });
  await do_post_message_test(
    t, root_dir, /*receiver=*/self, /*target=*/iframe.contentWindow,
    /*target_origin=*/'*');
}, 'Send and receive messages using a same origin iframe.');

directory_test(async (t, root_dir) => {
  const iframe = await add_iframe(t, { src: kDocumentMessageTarget });
  await do_message_port_test(
    t, root_dir, /*target=*/iframe.contentWindow, /*target_origin=*/'*');
}, 'Send and receive messages using a message port in a same origin ' +
'iframe.');

directory_test(async (t, root_dir) => {
  const iframe = await add_iframe(t, {
    src: kDocumentMessageTarget,
    sandbox: 'allow-scripts allow-same-origin'
  });
  await do_post_message_test(
    t, root_dir, /*receiver=*/self, /*target=*/iframe.contentWindow,
    /*target_origin=*/'*');
}, 'Send and receive messages using a sandboxed same origin iframe.');

directory_test(async (t, root_dir) => {
  const iframe = await add_iframe(t, {
    src: kDocumentMessageTarget,
    sandbox: 'allow-scripts allow-same-origin'
  });
  await do_message_port_test(
    t, root_dir, /*target=*/iframe.contentWindow, /*target_origin=*/'*');
}, 'Send and receive messages using a message port in a sandboxed same ' +
'origin iframe.');

directory_test(async (t, root_dir) => {
  const blob_url = await create_message_target_blob_url(t);
  const iframe = await add_iframe(t, { src: blob_url });
  await do_post_message_test(
    t, root_dir, /*receiver=*/self, /*target=*/iframe.contentWindow,
     /*target_origin=*/'*');
}, 'Send and receive messages using a blob iframe.');

directory_test(async (t, root_dir) => {
  const blob_url = await create_message_target_blob_url(t);
  const iframe = await add_iframe(t, { src: blob_url });
  await do_message_port_test(
    t, root_dir, /*target=*/iframe.contentWindow, /*target_origin=*/'*');
}, 'Send and receive messages using a message port in a blob iframe.');

directory_test(async (t, root_dir) => {
  const iframe_html = await create_message_target_html_without_subresources(t);
  const iframe = await add_iframe(t, { srcdoc: iframe_html });
  await do_post_message_test(
    t, root_dir, /*receiver=*/self, /*target=*/iframe.contentWindow,
    /*target_origin=*/'*');
}, 'Send and receive messages using an iframe srcdoc.');

directory_test(async (t, root_dir) => {
  const iframe_html = await create_message_target_html_without_subresources(t);
  const iframe = await add_iframe(t, { srcdoc: iframe_html });
  await do_message_port_test(
    t, root_dir, /*target=*/iframe.contentWindow, /*target_origin=*/'*');
}, 'Send and receive messages using a message port in an iframe srcdoc.');

directory_test(async (t, root_dir) => {
  const child_window = await open_window(t, kDocumentMessageTarget);
  await do_post_message_test(
    t, root_dir, /*receiver=*/self, /*target=*/child_window,
    /*target_origin=*/'*');
}, 'Send and receive messages using a same origin window.');

directory_test(async (t, root_dir) => {
  const child_window = await open_window(t, kDocumentMessageTarget);
  await do_message_port_test(
    t, root_dir, /*target=*/child_window, /*target_origin=*/'*');
}, 'Send and receive messages using a message port in a same origin ' +
'window.');

directory_test(async (t, root_dir) => {
  const blob_url = await create_message_target_blob_url(t);
  const child_window = await open_window(t, blob_url);
  await do_post_message_test(
    t, root_dir, /*receiver=*/self, /*target=*/child_window,
    /*target_origin=*/'*');
}, 'Send and receive messages using a blob window.');

directory_test(async (t, root_dir) => {
  const blob_url = await create_message_target_blob_url(t);
  const child_window = await open_window(t, blob_url);
  await do_message_port_test(
    t, root_dir, /*target=*/child_window, /*target_origin=*/'*');
}, 'Send and receive messages using a message port in a blob window.');

directory_test(async (t, root_dir) => {
  const url = `${kDocumentMessageTarget}?pipe=header(Content-Security-Policy` +
    ', sandbox allow-scripts allow-same-origin)';
  const child_window = await open_window(t, url);
  await do_post_message_test(
    t, root_dir, /*receiver=*/self, /*target=*/child_window,
    /*target_origin=*/'*');
}, 'Send and receive messages using a sandboxed same origin window.');

directory_test(async (t, root_dir) => {
  const url = `${kDocumentMessageTarget}?pipe=header(Content-Security-Policy` +
    ', sandbox allow-scripts allow-same-origin)';
  const child_window = await open_window(t, url);
  await do_message_port_test(
    t, root_dir, /*target=*/child_window, /*target_origin=*/'*');
}, 'Send and receive messages using a message port in a sandboxed same ' +
'origin window.');

directory_test(async (t, root_dir) => {
  const dedicated_worker =
    create_dedicated_worker(t, kDedicatedWorkerMessageTarget);
  await do_post_message_test(
    t, root_dir, /*receiver=*/dedicated_worker, /*target=*/dedicated_worker);
}, 'Send and receive messages using a dedicated worker.');

directory_test(async (t, root_dir) => {
  const dedicated_worker =
    create_dedicated_worker(t, kDedicatedWorkerMessageTarget);
  await do_message_port_test(t, root_dir, /*target=*/dedicated_worker);
}, 'Send and receive messages using a message port in a dedicated ' +
'worker.');

directory_test(async (t, root_dir) => {
  const scope = `${kServiceWorkerMessageTarget}?post-message-with-file-handle`;
  const registration = await service_worker_unregister_and_register(
    t, kServiceWorkerMessageTarget, scope);
  await do_post_message_test(
    t, root_dir, /*receiver=*/navigator.serviceWorker,
    /*target=*/registration.installing);
}, 'Send and receive messages using a service worker.');

directory_test(async (t, root_dir) => {
  const scope = `${kServiceWorkerMessageTarget}` +
    '?post-message-to-message-port-with-file-handle';
  const registration = await service_worker_unregister_and_register(
    t, kServiceWorkerMessageTarget, scope);
  await do_message_port_test(t, root_dir, /*target=*/registration.installing);
}, 'Send and receive messages using a message port in a service ' +
'worker.');

if (self.SharedWorker !== undefined) {
  directory_test(async (t, root_dir) => {
    const shared_worker = new SharedWorker(kSharedWorkerMessageTarget);
    shared_worker.port.start();
    await do_post_message_test(
      t, root_dir, /*receiver=*/shared_worker.port,
      /*target=*/shared_worker.port);
  }, 'Send and receive messages using a shared worker.');

  directory_test(async (t, root_dir) => {
    const shared_worker = new SharedWorker(kSharedWorkerMessageTarget);
    shared_worker.port.start();
    await do_message_port_test(t, root_dir, /*target=*/shared_worker.port);
  }, 'Send and receive messages using a message port in a shared ' +
  ' worker.');
}
