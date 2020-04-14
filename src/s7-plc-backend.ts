import {S7Client} from 'node-snap7';
import * as Yaml from 'yamljs';
import * as path from 'path';
import {merge, Observable} from "rxjs";
import {map, toArray} from "rxjs/internal/operators";
import {flatMap} from "rxjs/operators";
import {hasOwnProperty} from "tslint/lib/utils";

type PlcDatatype = 'bool' | 'byte' | 'real' | 'word' | 'dword' | 'int' | 'dint';

interface PlcBaseMetric {
    name: string;
    metricType: 'gauge' | 'counter' | 'histogram' | 'summary';
    help: string;
    datatype: PlcDatatype;
}

interface PlcSingleMetric extends PlcBaseMetric {
    offset: number;
}

interface PlcMultipleMetric extends PlcBaseMetric {
    multiple: {
        offset: number,
        label: string
    }[]
}

interface DB {
    number: number;
    metrics: PlcBaseMetric[];
}

export interface Target {
    ip: string;
    rack: number;
    slot: number;
    label?: string;
    db: DB[];
}

export interface ResultValue {
    metric: PlcBaseMetric,
    label?: string[];
    value: number;
}

export class S7PlcBackend {
    config: Target[] = Yaml.load(path.join(__dirname, '../config/targets.yaml'));
    currentValues: any = {};

    getValueAtOffset(buffer: Buffer, datatype: PlcDatatype, offset: number): number {
        switch (datatype) {
            case "real":
                return buffer.readFloatBE(offset);
            case "int":
                return buffer.readInt16BE(offset);
            case "dint":
                return buffer.readInt32BE(offset);
            case "word":
                return buffer.readUInt16BE(offset);
            case "dword":
                return buffer.readUInt32BE(offset);
            case "byte":
                return buffer.readUInt8(offset);
            case 'bool':
                const value = buffer.readUInt8(Math.trunc(offset));
                const offsetShift = (Math.round((offset % 1) * 10));
                return (value >> offsetShift) & 1;
            default:
                throw new Error('Unknown datatype ' + datatype + ' in config')
        }
    }

    handleValue(buffer: Buffer, plcMetric: PlcBaseMetric): Observable<ResultValue> {
        return new Observable<ResultValue>(
            subscriber => {
                if (hasOwnProperty(plcMetric, 'offset')) {
                    const value = this.getValueAtOffset(buffer, plcMetric.datatype, (plcMetric as PlcSingleMetric).offset);
                    subscriber.next({
                        metric: plcMetric,
                        value,
                    });
                } else if (hasOwnProperty(plcMetric, 'multiple')) {
                    (plcMetric as PlcMultipleMetric).multiple.forEach(
                        item => {
                            const value = this.getValueAtOffset(buffer, plcMetric.datatype, item.offset);

                            subscriber.next({
                                metric: plcMetric,
                                label: [item.label],
                                value,
                            });
                        }
                    )
                } else {
                    subscriber.error('neither "offset" nor "multiple" attribute found in config for metric ' + plcMetric.name)
                }

                subscriber.complete();
            }
        )
    }

    handleDb(s7Client: S7Client, db: DB): Observable<ResultValue> {
        return new Observable<ResultValue>(
            subscriber => {
                s7Client.DBGet(db.number,
                    (err, data) => {
                        if (err) {
                            subscriber.error('Error getting DB ' +
                                s7Client.ErrorText(err) + ' (' + err + ')')
                        } else {
                            db.metrics.forEach(
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

    handleTarget(target: Target): Observable<ResultValue[]> {
        return new Observable<ResultValue[]>(
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
                            target.db.forEach(
                                (db, idx, dbArray) =>
                                    this.handleDb(client, db)
                                        .pipe(
                                            map(value => {
                                                if (target.label) {
                                                    value.label = [...(value.label || []), target.label]
                                                }
                                                return value;
                                            }),
                                            toArray<ResultValue>(),
                                        )
                                        .subscribe(
                                            handledValue => {
                                                subscriber.next(handledValue);
                                                if (dbArray.length === idx + 1) {
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
        const observables: any[] = [];
        this.config.forEach(
            target => observables.push(this.handleTarget(target))
        );
        merge(...observables)
            .pipe(
                flatMap((data: ResultValue[]) => data),
                /*     groupBy(value => value.metric.name),
                     mergeMap(group => group.pipe(toArray())),*/
                toArray()
            )
            .subscribe(
                data => console.log(data),
                error => console.error(error)
            );
    }
}
