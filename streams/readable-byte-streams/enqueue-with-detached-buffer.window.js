promise_test(async t => {
  const error = new Error('cannot proceed');
  const rs = new ReadableStream({
    type: 'bytes',
    pull(controller) {
      t.step(() => {
        const buffer = controller.byobRequest.view.buffer;
        // Detach the buffer.
        postMessage(buffer, '*', [buffer]);

        // Try to enqueue with a new buffer.
        assert_throws_js(TypeError, () => controller.enqueue(new Uint8Array([42])));

        // If we got here the test passed.
        controller.error(error);
      });
    }
  });
  const reader = rs.getReader({ mode: 'byob' });
  await promise_rejects_exactly(t, error, reader.read(new Uint8Array(1)));
}, 'enqueue after detaching byobRequest.view.buffer should throw');
