import {S7Client} from 'node-snap7';
import * as Yaml from 'yamljs';
import * as path from 'path';
import {concat, merge, Observable} from "rxjs";
import {groupBy, map, mergeMap, toArray} from "rxjs/internal/operators";
import {hasOwnProperty} from "tslint/lib/utils";

enum Area {
    S7AreaPE = 0x81,
    S7AreaPA = 0x82,
    S7AreaMK = 0x83,
    S7AreaDB = 0x84,
    S7AreaCT = 0x1C,
    S7AreaTM = 0x1D
}

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

interface PlcArea {
    offset: number;
    size: number;
    metrics: PlcBaseMetric[];
}

export interface Target {
    ip: string;
    rack: number;
    slot: number;
    label?: string;
    db?: DB[];
    merkers?: PlcArea[];
    inputs?: PlcArea[];
    outputs?: PlcArea[];
    timers?: PlcArea[];
    counters?: PlcArea[];
}

export interface ResultValue {
    metric: PlcBaseMetric,
    label?: string[];
    value: number;
}

type AreaReadFunction = (start: number, size: number, callback?: (err: any, data: Buffer) => void) => Buffer | boolean;

export class S7PlcBackend {
    config: Target[];

    constructor() {
        const configFile = path.join(__dirname, '../config/targets.yaml');
        console.log('loading config from ', configFile);
        this.config = Yaml.load(configFile);
        console.log('config loaded with ', this.config.length, ' targets');
    }

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

    handleDb(s7Client: S7Client, db: DB): Observable<ResultValue[]> {
        return new Observable<ResultValue[]>(
            subscriber => {
                s7Client.DBGet(db.number,
                    (err, buffer) => {
                        if (err) {
                            subscriber.error('Error getting DB ' +
                                s7Client.ErrorText(err) + ' (' + err + ')')
                        } else {
                            const observables: any[] = [];
                            db.metrics.forEach(
                                value => observables.push(this.handleValue(buffer, value))
                            );
                            merge(...observables)
                                .pipe(
                                    toArray()
                                )
                                .subscribe(
                                    (data: ResultValue[]) => {
                                        subscriber.next(data);
                                        subscriber.complete();
                                    }
                                )
                        }
                    }
                )
            }
        )
    }

    handleAreaRead(s7Client: S7Client, readFunction: AreaReadFunction, areaConfig: PlcArea): Observable<ResultValue[]> {
        return new Observable<ResultValue[]>(
            subscriber => {
                readFunction(areaConfig.offset, areaConfig.size,
                    (err, buffer) => {
                        if (err) {
                            subscriber.error('Error getting Area ' + Area + ' ' +
                                s7Client.ErrorText(err) + ' (' + err + ')')
                        } else {
                            const observables: any[] = [];
                            areaConfig.metrics.forEach(
                                value => observables.push(this.handleValue(buffer, value))
                            );
                            merge(...observables)
                                .pipe(
                                    toArray()
                                )
                                .subscribe(
                                    (data: ResultValue[]) => {
                                        subscriber.next(data);
                                        subscriber.complete();
                                    }
                                )
                        }
                    }
                )
            }
        )
    }

    handleMerkers(s7Client: S7Client, start: number, size: number, areaConfig: PlcArea): Observable<ResultValue[]> {
        return new Observable<ResultValue[]>(
            subscriber => {
                s7Client.MBRead(start, size,
                    (err, buffer) => {
                        if (err) {
                            subscriber.error('Error getting Area ' + Area + ' ' +
                                s7Client.ErrorText(err) + ' (' + err + ')')
                        } else {
                            const observables: any[] = [];
                            areaConfig.metrics.forEach(
                                value => observables.push(this.handleValue(buffer, value))
                            );
                            merge(...observables)
                                .pipe(
                                    toArray()
                                )
                                .subscribe(
                                    (data: ResultValue[]) => {
                                        subscriber.next(data);
                                        subscriber.complete();
                                    }
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
                            const observableList: Observable<ResultValue>[] = [];

                            observableList.push(...this.getAreaObservables(target, client, Area.S7AreaDB));
                            observableList.push(...this.getAreaObservables(target, client, Area.S7AreaMK));
                            observableList.push(...this.getAreaObservables(target, client, Area.S7AreaPE));
                            observableList.push(...this.getAreaObservables(target, client, Area.S7AreaPA));
                            observableList.push(...this.getAreaObservables(target, client, Area.S7AreaCT));
                            observableList.push(...this.getAreaObservables(target, client, Area.S7AreaTM));

                            concat(...observableList)
                                .pipe(
                                    toArray()
                                )
                                .subscribe(
                                    handledValue => {
                                        subscriber.next(handledValue);
                                        subscriber.complete();
                                    },
                                    error => subscriber.error(error)
                                )
                        }
                    }
                )
            }
        )
    }

    getValues() {
        const observables: any[] = [];
        this.config.forEach(
            target => observables.push(this.handleTarget(target))
        );
        return merge(...observables)
            .pipe(
                mergeMap((data: ResultValue[]) => data),
                groupBy(value => value.metric.name),
                mergeMap(group => group.pipe(toArray())),
                toArray()
            );
    }

    private getDBObservables(target: Target, client: S7Client): Observable<ResultValue>[] {
        const observableList: Observable<ResultValue>[] = [];
        (target.db || []).forEach(
            (db) =>
                observableList.push(
                    this.handleDb(client, db)
                        .pipe(
                            mergeMap(values => values),
                            map(value => {
                                if (target.label) {
                                    value.label = [...(value.label || []), target.label]
                                }
                                return value;
                            }),
                        )
                )
        )
        return observableList;
    }

    private getAreaObservables(target: Target, client: S7Client, s7Area: Area) {
        let readFunction: AreaReadFunction = undefined;
        let areaList = undefined;
        switch (s7Area) {
            case Area.S7AreaPE:
                readFunction = client.EBRead.bind(client);
                areaList = target.inputs;
                break;
            case Area.S7AreaPA:
                readFunction = client.ABRead.bind(client);
                areaList = target.outputs;
                break;
            case Area.S7AreaMK:
                readFunction = client.MBRead.bind(client);
                areaList = target.merkers;
                break;
            case Area.S7AreaCT:
                readFunction = client.CTRead.bind(client);
                areaList = target.counters;
                break;
            case Area.S7AreaTM:
                readFunction = client.TMRead.bind(client);
                areaList = target.timers;
                break;
            case Area.S7AreaDB:
                return this.getDBObservables(target, client);
        }

        const observableList: Observable<ResultValue>[] = [];
        if (areaList) {
            areaList.forEach(
                (area) =>
                    observableList.push(
                        this.handleAreaRead(
                            client,
                            readFunction,
                            area)
                            .pipe(
                                mergeMap(values => values),
                                map(value => {
                                    if (target.label) {
                                        value.label = [...(value.label || []), target.label]
                                    }
                                    return value;
                                }),
                            )
                    )
            )
        }
        return observableList;
    }
}
