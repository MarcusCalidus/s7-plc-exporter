const mockGetValues = jest.fn();

jest.mock('../src/s7-plc-backend', () => ({
    S7PlcBackend: jest.fn().mockImplementation(() => ({getValues: mockGetValues}))
}));

import request from 'supertest';
import {of, throwError} from 'rxjs';
import {app} from '../src/index';

const groups = [
    [
        {metric: {name: 'plc_temperature', help: 'Temperature', metricType: 'gauge'}, label: ['plc="line1"'], value: 21.5},
        {metric: {name: 'plc_temperature', help: 'Temperature', metricType: 'gauge'}, label: ['plc="line2"'], value: 22}
    ],
    [
        {metric: {name: 'plc_uptime', help: 'Uptime', metricType: 'counter'}, value: 99}
    ]
];

describe('GET /values', () => {
    it('renders the Prometheus text exposition format', async () => {
        mockGetValues.mockReturnValue(of(groups));

        const res = await request(app).get('/values');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/plain');
        expect(res.text).toBe(
            '# HELP plc_temperature Temperature\n' +
            '# TYPE plc_temperature gauge\n' +
            'plc_temperature{plc="line1"} 21.5\n' +
            'plc_temperature{plc="line2"} 22\n' +
            '# HELP plc_uptime Uptime\n' +
            '# TYPE plc_uptime counter\n' +
            'plc_uptime 99\n'
        );
    });

    it('omits the label braces for a value with no labels', async () => {
        mockGetValues.mockReturnValue(of([[{metric: {name: 'm', help: 'h', metricType: 'gauge'}, value: 1}]]));

        const res = await request(app).get('/values');

        expect(res.text).toContain('\nm 1\n');
        expect(res.text).not.toContain('{}');
    });

    it('answers 500 when the backend fails', async () => {
        mockGetValues.mockReturnValue(throwError('PLC unreachable'));

        const res = await request(app).get('/values');

        expect(res.status).toBe(500);
        expect(res.text).toContain('PLC unreachable');
    });
});

describe('GET /valuesJson', () => {
    it('wraps the grouped values in a success envelope', async () => {
        mockGetValues.mockReturnValue(of(groups));

        const res = await request(app).get('/valuesJson');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/json');
        expect(JSON.parse(res.text)).toEqual({success: true, data: groups});
    });

    it('answers 500 with a failure envelope', async () => {
        mockGetValues.mockReturnValue(throwError({code: 7}));

        const res = await request(app).get('/valuesJson');

        expect(res.status).toBe(500);
        expect(JSON.parse(res.text)).toEqual({success: false, error: {code: 7}});
    });
});
