// Decode SSE across arbitrary network/UTF-8 boundaries. Provider adapters decide
// which terminal events count as completion; EOF alone never does.
export async function readEvents(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const dispatch = (block) => {
    const data = block
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (data && data !== "[DONE]") onEvent(JSON.parse(data));
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let separator;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        dispatch(buffer.slice(0, separator.index));
        buffer = buffer.slice(separator.index + separator[0].length);
      }
      if (done) break;
    }
    if (buffer.trim()) dispatch(buffer);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
