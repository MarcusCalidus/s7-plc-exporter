import express from 'express';
import {S7PlcBackend} from "./s7-plc-backend";

const serverPort = 8899;
const app = express();
const s7PlcBackend = new S7PlcBackend();

app.get('/valuesJson', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(s7PlcBackend.currentValues));
});

app.get('/values', (req, res) => {
    const valuePrefix = 's7_';
    const result: string[] = [];
    res.setHeader('Content-Type', 'text/plain');


    res.end(result.join('\n') + '\n');
});

// start the Express server
app.listen(serverPort, () => {
    console.log(`server started at http://localhost:${serverPort}`);
    s7PlcBackend.initialize()
});
