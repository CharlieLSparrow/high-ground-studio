const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:4000');
ws.on('open', () => {
    console.log('Connected, sending PUSH_LOCAL_TO_VAULT');
    ws.send(JSON.stringify({
        type: 'PUSH_LOCAL_TO_VAULT',
        payload: {
            fileName: 'test_video.mp4',
            root: 'desktop',
            subpath: ''
        }
    }));
});
ws.on('message', (data) => {
    console.log(data.toString());
});
setTimeout(() => process.exit(0), 5000);
