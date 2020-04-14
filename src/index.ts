import express from 'express';
import {S7PlcBackend} from "./s7-plc-backend";

const serverPort = 9712;
const app = express();
const s7PlcBackend = new S7PlcBackend();

app.get('/valuesJson', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    s7PlcBackend.getValues()
        .subscribe(
        data => {
            res.end(JSON.stringify({success: true, data: data}));
        },
        error => {
            res.statusCode = 500;
            res.end(JSON.stringify({success: false, error: error}))
        }
    );
});

app.get('/values', (req, res) => {
    res.setHeader('Content-Type', 'text/plain;charset=utf-8');

    s7PlcBackend.getValues()
        .subscribe(
            data => {
                const result: string[] = [];
                data.forEach(
                    metric => {
                        result.push(`# HELP ${metric[0].metric.name} ${metric[0].metric.help}`);
                        result.push(`# TYPE ${metric[0].metric.name} ${metric[0].metric.metricType}`);
                        metric.forEach(
                            line => result.push(`${line.metric.name}${line.label?'{'+line.label.join(',')+'}':''} ${line.value}`)
                        );
                    }
                );
                res.end(result.join('\n')+'\n');
            },
            error => {
                res.statusCode = 500;
                res.end(error)
            }
        );
});

// start the Express server
app.listen(serverPort, () => {
    console.log(`server started at http://localhost:${serverPort}`);
});
