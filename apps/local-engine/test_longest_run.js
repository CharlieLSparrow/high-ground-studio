const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const ws = new WebSocket('ws://localhost:4000');

ws.on('open', () => {
    console.log('Connected, starting longest run (3 videos)...');
    const videos = ['vid1.mp4', 'vid2.mp4', 'vid3.mp4'];
    let delay = 0;
    videos.forEach(v => {
      setTimeout(() => {
        ws.send(JSON.stringify({
            type: 'START_OFFLOAD',
            payload: {
                sourcePath: path.join('/tmp/longest_run_src', v),
                destinations: [
                    path.join('/tmp/offload_dest1', v),
                    path.join('/tmp/offload_dest2', v)
                ]
            }
        }));
      }, delay);
      delay += 5000; // stagger them slightly so we can watch them queue
    });
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log(msg.type, msg.payload?.file || '', msg.payload?.status || '', msg.payload?.progress || '');
});

setTimeout(() => process.exit(0), 40000);
