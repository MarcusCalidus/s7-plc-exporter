/**
 * Stands in for node-snap7. The real package is a native binding with no
 * loadable prebuilt binary here, so the PLC conversation is driven through
 * this stub. Tests set the static hooks to decide what each call returns.
 */
export class S7Client {
    static instances: S7Client[] = [];
    /** err passed to the ConnectTo callback; null means the connection succeeds */
    static connectError: any = null;
    /** returns [err, buffer] for a given read; keyed by "<fn>:<a>:<b>" */
    static reads: Record<string, [any, Buffer | undefined]> = {};

    connectedTo: { ip: string, rack: number, slot: number } | undefined;
    calls: string[] = [];

    constructor() {
        S7Client.instances.push(this);
    }

    static reset() {
        S7Client.instances = [];
        S7Client.connectError = null;
        S7Client.reads = {};
    }

    private respond(key: string, callback: (err: any, data: Buffer) => void) {
        this.calls.push(key);
        const [err, buffer] = S7Client.reads[key] || [null, Buffer.alloc(16)];
        callback(err, buffer as Buffer);
    }

    ConnectTo(ip: string, rack: number, slot: number, callback: (err: any) => void) {
        this.connectedTo = {ip, rack, slot};
        callback(S7Client.connectError);
    }

    ErrorText(err: any) {
        return 'error text for ' + err;
    }

    DBRead(db: number, start: number, size: number, callback: (err: any, data: Buffer) => void) {
        this.respond(`DBRead:${db}:${start}:${size}`, callback);
    }

    DBGet(db: number, callback: (err: any, data: Buffer) => void) {
        this.respond(`DBGet:${db}`, callback);
    }

    MBRead(start: number, size: number, callback: (err: any, data: Buffer) => void) {
        this.respond(`MBRead:${start}:${size}`, callback);
    }

    EBRead(start: number, size: number, callback: (err: any, data: Buffer) => void) {
        this.respond(`EBRead:${start}:${size}`, callback);
    }

    ABRead(start: number, size: number, callback: (err: any, data: Buffer) => void) {
        this.respond(`ABRead:${start}:${size}`, callback);
    }

    CTRead(start: number, size: number, callback: (err: any, data: Buffer) => void) {
        this.respond(`CTRead:${start}:${size}`, callback);
    }

    TMRead(start: number, size: number, callback: (err: any, data: Buffer) => void) {
        this.respond(`TMRead:${start}:${size}`, callback);
    }
}
