import {S7PlcBackend, Target} from '../src/s7-plc-backend';
import {S7Client} from './stubs/node-snap7';
import {toArray} from 'rxjs/operators';

const target = (overrides: Partial<Target> = {}): Target => ({
    ip: '192.168.0.10',
    rack: 0,
    slot: 2,
    label: 'plc="line1"',
    ...overrides
});

/** A DB read whose buffer holds a known value at each supported width. */
const sampleBuffer = () => {
    const buf = Buffer.alloc(24);
    buf.writeFloatBE(3.5, 0);       // real   @0
    buf.writeInt16BE(-1234, 4);     // int    @4
    buf.writeInt32BE(-123456, 6);   // dint   @6
    buf.writeUInt16BE(65000, 10);   // word   @10
    buf.writeUInt32BE(4000000000, 12); // dword @12
    buf.writeUInt8(200, 16);        // byte   @16
    buf.writeUInt8(0b00000100, 17); // bool   @17.2 is set
    return buf;
};

describe('getValueAtOffset', () => {
    const backend = new S7PlcBackend([]);
    const buf = sampleBuffer();

    it.each([
        ['real', 0, 3.5],
        ['int', 4, -1234],
        ['dint', 6, -123456],
        ['word', 10, 65000],
        ['dword', 12, 4000000000],
        ['byte', 16, 200]
    ])('reads a %s big-endian', (datatype, offset, expected) => {
        expect(backend.getValueAtOffset(buf, datatype as any, offset)).toBe(expected);
    });

    it('reads a bool from the bit named by the fractional part of the offset', () => {
        expect(backend.getValueAtOffset(buf, 'bool', 17.2)).toBe(1);
        expect(backend.getValueAtOffset(buf, 'bool', 17.0)).toBe(0);
        expect(backend.getValueAtOffset(buf, 'bool', 17.1)).toBe(0);
        expect(backend.getValueAtOffset(buf, 'bool', 17.3)).toBe(0);
    });

    it('rejects an unknown datatype', () => {
        expect(() => backend.getValueAtOffset(buf, 'quad' as any, 0))
            .toThrow('Unknown datatype quad in config');
    });
});

describe('handleValue', () => {
    const backend = new S7PlcBackend([]);
    // toPromise() rather than lastValueFrom(), so the suite runs on rxjs 6 and 7 alike
    const collect = (metric: any) => backend.handleValue(sampleBuffer(), metric).pipe(toArray()).toPromise();

    it('emits one value for a metric with a single offset', async () => {
        const metric = {name: 'm', metricType: 'gauge', help: 'h', datatype: 'int', offset: 4};

        await expect(collect(metric)).resolves.toEqual([{metric, value: -1234}]);
    });

    it('emits one labelled value per entry for a multiple metric', async () => {
        const metric = {
            name: 'm', metricType: 'gauge', help: 'h', datatype: 'int',
            multiple: [{offset: 4, label: 'a="1"'}, {offset: 4, label: 'a="2"'}]
        };

        await expect(collect(metric)).resolves.toEqual([
            {metric, label: ['a="1"'], value: -1234},
            {metric, label: ['a="2"'], value: -1234}
        ]);
    });

    it('errors when a metric declares neither offset nor multiple', async () => {
        const metric = {name: 'broken', metricType: 'gauge', help: 'h', datatype: 'int'};

        await expect(collect(metric)).rejects.toContain(
            'neither "offset" nor "multiple" attribute found in config for metric broken'
        );
    });
});

describe('getValues', () => {
    beforeEach(() => S7Client.reset());

    const metric = (name: string, offset: number) =>
        ({name, metricType: 'gauge', help: name + ' help', datatype: 'int', offset});

    it('connects with the configured ip, rack and slot', async () => {
        const backend = new S7PlcBackend([target({db: [{number: 1, start: 0, size: 8, metrics: [metric('a', 4)] as any}]})]);

        await backend.getValues().toPromise();

        expect(S7Client.instances).toHaveLength(1);
        expect(S7Client.instances[0].connectedTo).toEqual({ip: '192.168.0.10', rack: 0, slot: 2});
    });

    it('uses DBRead when a size is configured and DBGet when it is not', async () => {
        S7Client.reads['DBRead:1:0:8'] = [null, sampleBuffer()];
        S7Client.reads['DBGet:2'] = [null, sampleBuffer()];
        const backend = new S7PlcBackend([target({
            db: [
                {number: 1, start: 0, size: 8, metrics: [metric('sized', 4)] as any},
                {number: 2, metrics: [metric('unsized', 4)] as any}
            ]
        })]);

        await backend.getValues().toPromise();

        expect(S7Client.instances[0].calls).toEqual(['DBRead:1:0:8', 'DBGet:2']);
    });

    it('groups values by metric name and appends the target label', async () => {
        S7Client.reads['DBRead:1:0:24'] = [null, sampleBuffer()];
        const backend = new S7PlcBackend([target({
            db: [{number: 1, start: 0, size: 24, metrics: [metric('temperature', 4), metric('pressure', 10)] as any}]
        })]);

        const groups: any = await backend.getValues().toPromise();
        const byName: Record<string, any[]> = {};
        groups.forEach((g: any[]) => byName[g[0].metric.name] = g);

        expect(Object.keys(byName).sort()).toEqual(['pressure', 'temperature']);
        expect(byName.temperature[0].value).toBe(-1234);
        expect(byName.temperature[0].label).toEqual(['plc="line1"']);
    });

    it('reads each configured area with its matching snap7 call', async () => {
        const backend = new S7PlcBackend([target({
            merkers: [{offset: 0, size: 4, metrics: [metric('mk', 0)] as any}],
            inputs: [{offset: 1, size: 4, metrics: [metric('in', 0)] as any}],
            outputs: [{offset: 2, size: 4, metrics: [metric('out', 0)] as any}],
            counters: [{offset: 3, size: 4, metrics: [metric('ct', 0)] as any}],
            timers: [{offset: 4, size: 4, metrics: [metric('tm', 0)] as any}]
        })]);

        await backend.getValues().toPromise();

        expect(S7Client.instances[0].calls).toEqual([
            'MBRead:0:4', 'EBRead:1:4', 'ABRead:2:4', 'CTRead:3:4', 'TMRead:4:4'
        ]);
    });

    it('reports a connection failure through the error channel', async () => {
        S7Client.connectError = 42;
        const backend = new S7PlcBackend([target({db: [{number: 1, start: 0, size: 8, metrics: [metric('a', 4)] as any}]})]);

        await expect(backend.getValues().toPromise())
            .rejects.toContain('Error connecting to PLC -error text for 42 (42)');
    });

    it('reports a failed DB read through the error channel', async () => {
        S7Client.reads['DBRead:1:0:8'] = [7, undefined];
        const backend = new S7PlcBackend([target({db: [{number: 1, start: 0, size: 8, metrics: [metric('a', 4)] as any}]})]);

        await expect(backend.getValues().toPromise())
            .rejects.toContain('Error getting DB error text for 7 (7)');
    });

    it('opens one client per configured target', async () => {
        const backend = new S7PlcBackend([
            target({ip: '10.0.0.1', db: [{number: 1, start: 0, size: 8, metrics: [metric('a', 4)] as any}]}),
            target({ip: '10.0.0.2', db: [{number: 1, start: 0, size: 8, metrics: [metric('b', 4)] as any}]})
        ]);

        await backend.getValues().toPromise();

        expect(S7Client.instances.map(c => c.connectedTo!.ip).sort()).toEqual(['10.0.0.1', '10.0.0.2']);
    });
});
