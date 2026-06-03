const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const ws = new WebSocket('ws://localhost:4000');

ws.on('open', () => {
    console.log('Connected, sending START_OFFLOAD');
    ws.send(JSON.stringify({
        type: 'START_OFFLOAD',
        payload: {
            sourcePath: path.join(os.homedir(), 'Desktop', 'real_test_video.mp4'),
            destinations: [
                '/tmp/offload_dest1/real_test_video.mp4',
                '/tmp/offload_dest2/real_test_video.mp4'
            ]
        }
    }));
});

ws.on('message', (data) => {
    console.log(data.toString());
});

setTimeout(() => process.exit(0), 5000);
