# s7-plc-exporter - a Prometheus exporter for Siemens S7 PLC

## Prerequisites
In order to run s7-plc-exporter you need Node.js installed on your system.

## Installation
The Installation is simple as can be. 
```
npm i
```

## Configuration



## Running
To start the server run. 

```
node path/to/s7-plc-exporter
```

or

```
npx path/to/s7-plc-exporter
```

(You might want to run this as a service)

## Getting the values
The exporter provides the values as follows

```
http://{YourExporterServer}:9693/values

e.g. http://localhost:9693/values

Raw JSON Data like so: http://{YourExporterServer}:9693/valuesJson
```
