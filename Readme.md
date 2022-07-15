# s7-plc-exporter - a Prometheus exporter for Siemens S7 PLC

s7-plc-exporter is a generic Prometheus exporter for 
values from Siemens S7 PLC (See [sompatibilty](http://snap7.sourceforge.net/snap7_client.html#target_compatibility))

## Prerequisites
In order to run s7-plc-exporter you need Node.js installed on your system.

## Installation
The Installation is simple as can be. 
```
npm i
```

## Configuration

The exporter is configured via the `targets.yaml` file located in the `config` folder. Each target represents an unique PLC.

You will have to create a targets.yaml before you can start the server!

```
- ip:       10.11.4.51                  # IP address of the S7 PLC 
  rack:     0                           # Rack of the S7 PLC
  slot:     2                           # Slot of the S7 PLC
  label:    target="1"                  # OPTIONAL label for all metrics on this target
  db:                                   # List of DBs to query from
    - number:   7                       # DB number
      start:    0                       # OPTIONAL to read only a part of the DB
      size     12                       # OPTIONAL to read only a part of the DB
      metrics:                          # List of metrics to query from DB
        - name:         locked_status   # name of metric as it appears to Prometheus
          datatype:     bool            # Datatype of value in PLC (bool|byte|real|word|dword|int|dint)
          metricType:   gauge           # Type of metric as it appears to Prometheus (currently only gauge is supported)
          help:         Locked Status   # HELP string as it appears to Prometheus
          offset:       0               # Memory offset of value as defined in STEP 7 (TIA Portal) - offset will be added to start value if present
        - name:         extraction_status
          datatype:     bool
          metricType:   gauge
          help:         Extraction Status
          multiple:                     # ALTERNATIVELY to offset it is possible to query multiple values for one metric
            - offset:       8.2         # Offset kann be written in 0.0 to 0.7 steps to read bitwise
              label:        tank="1"    # Define labels to distinguish the values within one metric
            - offset:       10.2
              label:        tank="2"
```

additionally to DBs you also can read other areas of the PLC (inputs, outputs, counters, timers, merkers)

```
- ip:       10.11.4.51                  # IP address of the S7 PLC 
  rack:     0                           # Rack of the S7 PLC
  slot:     2                           # Slot of the S7 PLC
  label:    target="1"                  # OPTIONAL label for all metrics on this target
  merkers:                              # type of data to read (inputs|outputs|merkers|timers|counters)
    - offset: 4                         # offset of data to read
      size: 1                           # number of words to read - result size depends on word length of data type
      metrics:                          # metrics are defined like above
        - name: tank_emptied
          datatype: bool
          metricType: gauge
          help: Tank was emptied
          multiple:
            - offset: 0.0
              label: tank="1"
            - offset: 0.1
              label: tank="2"
            - offset: 0.2
              label: tank="3"
            - offset: 0.3
              label: tank="4"
            - offset: 0.6
              label: tank="5"
            - offset: 0.7
              label: tank="6"
```

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
http://{YourExporterServer}:9712/values

e.g. http://localhost:9712/values

Raw JSON Data like so: http://{YourExporterServer}:9712/valuesJson
```
