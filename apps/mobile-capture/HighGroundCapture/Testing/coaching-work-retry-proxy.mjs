// Local fault injection: persist through the real API, then lose the success
// response once for creation and once for its amendment. No production target.
import { createServer } from 'node:http';

const title = process.env.CAPTURE_WORK_RETRY_TITLE;
if (!title) throw new Error('CAPTURE_WORK_RETRY_TITLE must name a synthetic test item.');
const failureMode = process.env.CAPTURE_WORK_RETRY_FAILURE ?? 'http';
if (!['http', 'disconnect'].includes(failureMode)) throw new Error('Choose http or disconnect for the local failure mode.');
function loseReply(res, operation) {
  if (failureMode === 'disconnect') {
    res.destroy();
  } else {
    res.writeHead(503, {'Content-Type': 'application/json'}).end(JSON.stringify({ok: false, error: `Test connection interrupted after ${operation}. Try Save again.`}));
  }
}
const attempts = new Set();
const amended = new Set();
const createdIDs = new Set();
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 512_000) throw new Error('Test request too large');
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const headers = {...req.headers};
    delete headers.host;
    delete headers.connection;
    delete headers['content-length'];
    const target = new URL(req.url, 'http://127.0.0.1:3012');
    if (target.origin !== 'http://127.0.0.1:3012') throw new Error('Only the local Nest test server is allowed');
    const response = await fetch(target, {
      method: req.method, headers, body: body.length ? body : undefined,
      redirect: 'manual', signal: AbortSignal.timeout(90_000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (req.url === '/api/mobile/capture/transcripts/tasks' && req.method === 'POST' && response.ok) {
      const input = JSON.parse(body.toString());
      const output = JSON.parse(bytes.toString());
      if (input.save?.original?.title === title) {
        const revision = input.save.revision;
        const key = `${input.clientRequestId}:${revision}`;
        createdIDs.add(output.task.id);
        const lostReply = revision < 2 && !attempts.has(key);
        console.log(JSON.stringify({method: 'POST', requestID: input.clientRequestId, entryID: output.task.id,
          revision, distinctItems: createdIDs.size, lostReply, failureMode}));
        if (lostReply) {
          attempts.add(key);
          loseReply(res, `saving revision ${revision}`);
          return;
        }
      }
    }
    const isWork = /^\/api\/coaching\/engagements\/[^/]+\/work$/.test(req.url);
    if (isWork && response.ok && ['POST', 'PATCH'].includes(req.method)) {
      const input = JSON.parse(body.toString());
      const output = JSON.parse(bytes.toString());
      if (req.method === 'POST' && input.title === title) {
        createdIDs.add(output.entry.id);
        console.log(JSON.stringify({method: 'POST', requestID: input.clientRequestId, entryID: output.entry.id, distinctItems: createdIDs.size}));
        if (!attempts.has(input.clientRequestId)) {
          attempts.add(input.clientRequestId);
          console.log(JSON.stringify({method: 'POST', entryID: output.entry.id, lostReply: true, failureMode}));
          loseReply(res, 'saving');
          return;
        }
      }
      if (req.method === 'PATCH' && createdIDs.has(input.id) && !amended.has(input.id)) {
        amended.add(input.id);
        console.log(JSON.stringify({method: 'PATCH', entryID: input.id, lostReply: true, failureMode}));
        loseReply(res, 'updating');
        return;
      }
    }
    res.writeHead(response.status, {'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream'}).end(bytes);
  } catch {
    res.writeHead(502, {'Content-Type': 'application/json'}).end(JSON.stringify({ok:false,error:'Local test proxy could not reach Nest.'}));
  }
});
server.listen(3014, '127.0.0.1', () => console.log('Local work retry proxy listening on 127.0.0.1:3014'));
process.on('SIGTERM', () => { server.close(); server.closeAllConnections(); });
