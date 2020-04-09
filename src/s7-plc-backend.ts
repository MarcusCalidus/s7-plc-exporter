import {S7Client} from 'node-snap7';
import * as Yaml from 'yamljs';
import * as path from 'path';

export class S7PlcBackend {
    config = Yaml.load(path.join(__dirname,'../config/targets.yaml'));
    s7client = new S7Client();
    currentValues: any = {};

    initialize() {
        this.s7client.ConnectTo(
            '10.11.4.51',
            0,
            2,
                err => {
                if (err) {
                    console.error('Error connecting to PLC -', this.s7client.ErrorText(err) + ' (' + err +')');
                }
                console.log(JSON.stringify(this.config))
            });
    }
}
