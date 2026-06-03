const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:4000');
ws.on('open', () => {
    console.log('Connected, waiting 2 seconds then sending GET_STATUS');
    ws.send(JSON.stringify({ type: 'GET_STATUS' })); // Trigger the fetch
    setTimeout(() => {
        ws.send(JSON.stringify({ type: 'GET_STATUS' })); // Get the populated array
    }, 3000);
});
ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'SYNC_PROGRESS') {
        console.log(msg.payload.status.cloudVault);
    }
});
setTimeout(() => process.exit(0), 5000);
