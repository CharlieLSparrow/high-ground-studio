const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:4000');
ws.on('open', () => {
    console.log('Connected, sending VERIFY_FILE_CHECKSUM');
    ws.send(JSON.stringify({
        type: 'VERIFY_FILE_CHECKSUM',
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
setTimeout(() => process.exit(0), 2000);
