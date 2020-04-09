import {S7Client} from 'node-snap7';
import * as Yaml from 'yamljs';
import * as path from 'path';
import {merge, Observable} from "rxjs";
import {toArray} from "rxjs/internal/operators";
import {flatMap} from "rxjs/operators";

interface PlcValue {
    name: string;
    metricType: 'gauge' | 'counter' | 'histogram' | 'summary';
    help: string;
    label?: string;
    datatype: 'bool' | 'byte' | 'real' | 'word' | 'dword' | 'int' | 'dint';
    offset: number;
}

interface Database {
    number: number;
    values: PlcValue[];
}

export interface Target {
    name: string;
    ip: string;
    rack: number;
    slot: number;
    databases: Database[];
}

export class S7PlcBackend {
    config: Target[] = Yaml.load(path.join(__dirname, '../config/targets.yaml'));
    currentValues: any = {};

    handleValue(buffer: Buffer, plcValue: PlcValue) {
        return new Observable(
            subscriber => {
                let value: any;
                switch (plcValue.datatype) {
                    case "real":
                        value = buffer.readFloatBE(plcValue.offset);
                        break;
                    case "int":
                        value = buffer.readInt16BE(plcValue.offset);
                        break;
                    case "dint":
                        value = buffer.readInt32BE(plcValue.offset);
                        break;
                    case "word":
                        value = buffer.readUInt16BE(plcValue.offset);
                        break;
                    case "dword":
                        value = buffer.readUInt32BE(plcValue.offset);
                        break;
                    case "byte":
                        value = buffer.readUInt8(plcValue.offset);
                        break;
                    case 'bool':
                        value = buffer.readUInt8(Math.trunc(plcValue.offset));
                        const offsetShift = (Math.round((plcValue.offset % 1) * 10));
                        value = (value >> offsetShift) & 1;
                        break;
                    default:
                        subscriber.error('Unknown datatype ' + plcValue.datatype + ' in config')
                }

                subscriber.next({
                    plcValue: plcValue,
                    value: value,
                });
                subscriber.complete();
            }
        )
    }

    handleDb(s7Client: S7Client, db: Database) {
        return new Observable(
            subscriber => {
                s7Client.DBGet(db.number,
                    (err, data) => {
                        if (err) {
                            subscriber.error('Error getting DB ' +
                                s7Client.ErrorText(err) + ' (' + err + ')')
                        } else {
                            db.values.forEach(
                                (value, idx, values) => this.handleValue(data, value)
                                .subscribe(
                                    handledValue => {
                                        subscriber.next(handledValue);
                                        if (values.length === idx + 1) {
                                            subscriber.complete();
                                        }
                                    },
                                    error => subscriber.error(error)
                                )
                        )
                        }
                    }
                )
            }
        )

    }

    handleTarget(target: Target): Observable<PlcValue[]> {
        return new Observable(
            subscriber => {
                const client = new S7Client();
                client.ConnectTo(
                    target.ip,
                    target.rack,
                    target.slot,
                    (err) => {
                        if (err) {
                            subscriber.error('Error connecting to PLC -' + client.ErrorText(err) + ' (' + err + ')');
                        } else {
                            target.databases.forEach(
                                (database, idx, databases) => this.handleDb(client, database)
                                    .pipe(
                                        toArray<PlcValue>(),
                                    )
                                    .subscribe(
                                        handledValue => {
                                            subscriber.next(handledValue);
                                            if (databases.length === idx + 1) {
                                                subscriber.complete();
                                            }
                                        },
                                        error => subscriber.error(error)
                                    )
                            )
                        }
                    }
                )
            }
        )
    }

    initialize() {
        let observables: any[] = [];
        this.config.forEach(
            target => observables.push(this.handleTarget(target))
        );
        merge(...observables)
            .pipe(
                flatMap(data => data as any),
                toArray()
            )
            .subscribe(
                data => console.log(data),
                error => console.error(error)
            );
    }
}
