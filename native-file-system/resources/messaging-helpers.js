'use strict';

// This script depends on the following script:
//    /native-file-system/resources/test-helpers.js

// Define the URL constants used for each type of message target, including
// iframes and workers.
const kDocumentMessageTarget = 'resources/message-target.html';
const kSharedWorkerMessageTarget = 'resources/message-target-shared-worker.js';
const kServiceWorkerMessageTarget =
  'resources/message-target-service-worker.js';
const kDedicatedWorkerMessageTarget =
  'resources/message-target-dedicated-worker.js';

function create_dedicated_worker(test, url) {
  const dedicated_worker = new Worker(url);
  test.add_cleanup(() => {
    dedicated_worker.terminate();
  });
  return dedicated_worker;
}

// Creates an iframe and waits to receive a message from the iframe.
// Valid |options| include src, srdoc and sandbox, which mirror the
// corresponding iframe element properties.
async function add_iframe(test, options) {
  const iframe = document.createElement('iframe');

  if (options.sandbox !== undefined) {
    iframe.sandbox = options.sandbox;
  }

  if (options.src !== undefined) {
    iframe.src = options.src;
  }

  if (options.srcdoc !== undefined) {
    iframe.srcdoc = options.srcdoc;
  }

  document.body.appendChild(iframe);
  test.add_cleanup(() => {
    iframe.remove();
  });

  await wait_for_loaded_message(self);
  return iframe;
}

// Creates a child window using window.open() and waits to receive a message
// from the child window.
async function open_window(test, url) {
  const child_window = window.open(url);
  test.add_cleanup(() => {
    child_window.close();
  });
  await wait_for_loaded_message(self);
  return child_window;
}

// Wait until |receiver| gets a message event with the data set to 'LOADED'.
// The postMessage() tests use messaging instead of the loaded event because
// cross-origin child windows from window.open() do not dispatch the loaded
// event to the parent window.
async function wait_for_loaded_message(receiver) {
  const message_promise = new Promise((resolve, reject) => {
    receiver.addEventListener('message', message_event => {
      if (message_event.data === 'LOADED') {
        resolve();
      } else {
        reject('The message target must receive a "LOADED" message response.');
      }
    });
  });
  await message_promise;
}

// Sets up a new message channel.  Sends one port to |target| and then returns
// the other port.
function create_message_channel(target, target_origin) {
  const message_channel = new MessageChannel();

  const message_data =
    { type: 'receive-message-port', message_port: message_channel.port2 };

  if (target_origin !== undefined) {
    target.postMessage(message_data, target_origin, [message_channel.port2]);
  } else {
    target.postMessage(message_data, [message_channel.port2]);
  }
  message_channel.port1.start();
  return message_channel.port1;
}

// Creates a variety of different FileSystemFileHandles for testing.
async function create_file_system_handles(test, root) {
  // Create some files to use with postMessage().
  const empty_file = await createEmptyFile(test, 'empty-file', root);
  const first_file = await createFileWithContents(
    test, 'first-file-with-contents', 'first-text-content', root);
  const second_file = await createFileWithContents(
    test, 'second-file-with-contents', 'second-text-content', root);

  // Create an empty directory to use with postMessage().
  const empty_directory = await createDirectory(test, 'empty-directory', root);

  // Create a directory containing both files and subdirectories to use
  // with postMessage().
  const directory_with_files =
    await createDirectory(test, 'directory-with-files', root);
  await createFileWithContents(test, 'first-file-in-directory',
    'first-directory-text-content', directory_with_files);
  await createFileWithContents(test, 'second-file-in-directory',
    'second-directory-text-content', directory_with_files);
  const subdirectory =
    await createDirectory(test, 'subdirectory', directory_with_files);
  await createFileWithContents(test, 'first-file-in-subdirectory',
    'first-subdirectory-text-content', subdirectory);

  return [
    empty_file,
    first_file,
    second_file,
    // Include the same FileSystemFileHandle twice.
    second_file,
    empty_directory,
    // Include the Same FileSystemDirectoryHandle object twice.
    empty_directory,
    directory_with_files
  ];
}

// Verifies |left_array| is a clone of |right_array| where each element
// is a cloned FileSystemHandle with the same properties and contents.
async function assert_equals_cloned_handles(left_array, right_array) {
  assert_equals(left_array.length, right_array.length,
    'Each array of FileSystemHandles must have the same length');

  for (let i = 0; i < left_array.length; ++i) {
    assert_not_equals(left_array[i], right_array[i],
      'Clones must create new FileSystemHandle instances.');

    const left_serialized = await serialize_handle(left_array[i]);
    const right_serialized = await serialize_handle(right_array[i]);
    assert_equals_serialized_handle(left_serialized, right_serialized);
  }
}