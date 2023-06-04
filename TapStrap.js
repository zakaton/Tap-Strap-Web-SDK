/* global THREE, BluetoothUUID */

const { EventDispatcher, Vector3 } = THREE;

class TapStrap {
  constructor() {
    this.services = {};

    this.inputMode = "controller";
    this.sensitivity = [0, 0, 0];

    this.mouseMode = TapStrap.MouseModeEnumeration.indexOf("STDBY");

    this.decoder = new TextDecoder("utf-8");
    this.deviceInformation = {};
  }

  // UTILS
  static arrayToDataView(array) {
    const dataView = new DataView(new ArrayBuffer(array.length));
    array.forEach((value, index) => dataView.setUint8(index, value));
    return dataView;
  }
  padHex(value) {
    return ("00" + value.toString(16).toUpperCase()).slice(-2);
  }

  // CONNECTION
  async connect() {
    if (!this.isConnected) {
      console.log("requesting device...");
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          {
            services: [
              ...Object.values(TapStrap.services).map((_) => _.uuid),
              "battery_service",
              "device_information",
            ],
            optionalServices: [
              // https://googlechrome.github.io/samples/web-bluetooth/battery-level.html
              "battery_service",

              // https://googlechrome.github.io/samples/web-bluetooth/device-information-characteristics.html
              "device_information",
            ],
            namePrefix: "Tap_",
          },
        ],
      });
      console.log("obtained device", this.device);
      this.device.ongattserverdisconnected =
        this.ongattserverdisconnected.bind(this);
      await this.device.gatt.connect();
      console.log("connected to tap strap");

      await Object.keys(TapStrap.services).forEach(async (serviceName) => {
        const serviceUUID = TapStrap.services[serviceName].uuid;
        console.log(`getting service ${serviceName}`);
        const service = await this.device.gatt.getPrimaryService(serviceUUID);
        console.log(`got service ${serviceName}`);
        this.services[serviceName] = {
          service,
          characteristics: {},
        };
        await Object.keys(
          TapStrap.services[serviceName].characteristics
        ).forEach(async (characteristicName) => {
          const characteristicUUID =
            TapStrap.services[serviceName].characteristics[characteristicName]
              .uuid;
          console.log(`getting characteristic ${characteristicName}`);
          const characteristic = await service.getCharacteristic(
            characteristicUUID
          );
          console.log(`got characteristic ${characteristicName}`);
          this.services[serviceName].characteristics[characteristicName] = {
            characteristic,
          };
          if (characteristic.properties.notify) {
            console.log(`starting notifications on ${characteristicName}`);
            characteristic.addEventListener(
              "characteristicvaluechanged",
              this.oncharacteristicvaluechanged.bind(this)
            );
            await characteristic.startNotifications();
            console.log(`started notifications on ${characteristicName}`);
          }
        });
      });

      // Battery Service
      console.log("getting battery level service...");
      const batteryLevelService = await this.device.gatt.getPrimaryService(
        "battery_service"
      );
      console.log("got battery level service", batteryLevelService);
      this.services.batteryLevel = {
        service: batteryLevelService,
        characteristics: {},
      };
      console.log("getting battery level characteristic...");
      const batteryLevelCharacteristic =
        await batteryLevelService.getCharacteristic("battery_level");
      console.log(
        "got battery level characteristic",
        batteryLevelCharacteristic
      );
      this.services.batteryLevel.characteristics.batteryLevel =
        batteryLevelCharacteristic;

      // Device Information
      console.log("getting device information service...");
      const deviceInformationService = await this.device.gatt.getPrimaryService(
        "device_information"
      );
      console.log("got device information service", deviceInformationService);
      this.services.deviceInformation = {
        service: deviceInformationService,
        characteristics: {},
      };
      console.log("getting device information characteristics...");
      const deviceInformationCharacteristics =
        await deviceInformationService.getCharacteristics();
      console.log(
        "got device information characteristics",
        deviceInformationCharacteristics
      );
      deviceInformationCharacteristics.forEach(async (characteristic) => {
        let value;
        switch (characteristic.uuid) {
          case BluetoothUUID.getCharacteristic("manufacturer_name_string"):
            value = await characteristic.readValue();
            this.deviceInformation.manufacturerName =
              this.decoder.decode(value);
            break;

          case BluetoothUUID.getCharacteristic("model_number_string"):
            value = await characteristic.readValue();
            this.deviceInformation.modelNumber = this.decoder.decode(value);
            break;

          case BluetoothUUID.getCharacteristic("hardware_revision_string"):
            value = await characteristic.readValue();
            this.deviceInformation.hardwareRevision =
              this.decoder.decode(value);
            break;

          case BluetoothUUID.getCharacteristic("firmware_revision_string"):
            value = await characteristic.readValue();
            this.deviceInformation.firmwareRevision =
              this.decoder.decode(value);
            break;

          case BluetoothUUID.getCharacteristic("software_revision_string"):
            value = await characteristic.readValue();
            this.deviceInformation.softwareRevision =
              this.decoder.decode(value);
            break;

          case BluetoothUUID.getCharacteristic("pnp_id"):
            value = await characteristic.readValue();
            this.deviceInformation.pnpId = {
              vendorIdSource: value.getUint8(0) === 1 ? "Bluetooth" : "USB",
              vendorId:
                value.getUint8(0) === 1
                  ? value.getUint8(1) | (value.getUint8(2) << 8)
                  : value.getUint8(1) | (value.getUint8(2) << 8),
              productId: value.getUint8(3) | (value.getUint8(4) << 8),
              productVersion: value.getUint8(5) | (value.getUint8(6) << 8),
            };
            break;

          default:
            value = await characteristic.readValue();
            console.log(
              `Unknown Device Information Characteristic Value: ${this.decoder.decode(
                value
              )}`
            );
            break;
        }
      });

      this.dispatchEvent({ type: "connect" });
      this.start();
      console.log("connected");
    }
  }

  get isConnected() {
    return this.device && this.device.gatt.connected;
  }

  ongattserverdisconnected(event) {
    this.dispatchEvent({ type: "disconnect" });
    return this.device.gatt.connect();
  }

  // https://github.com/TapWithUs/tap-python-sdk/blob/bf1372a12daee7b1977366484cc10650eb965b7a/tapsdk/backends/macos/TapSDK.py#L124
  get inputMode() {
    return this._inputMode || "controller";
  }
  set inputMode(inputMode) {
    if (inputMode in TapStrap.InputModes) {
      this._inputMode = inputMode;
      this.start();
    }
  }

  get inputModeCode() {
    if (this.inputMode == "raw") {
      return this._rawInputModeCode || TapStrap.InputModes.raw;
    } else {
      return TapStrap.InputModes[this.inputMode];
    }
  }

  // https://github.com/TapWithUs/tap-python-sdk/blob/bf1372a12daee7b1977366484cc10650eb965b7a/tapsdk/backends/macos/TapSDK.py#L143
  writeInputMode(inputMode = this.inputMode) {
    if (this.isConnected) {
      console.log(`writing ${inputMode}`);
      return this.services.support.characteristics.tapMode.characteristic.writeValue(
        this.inputModeCode
      );
    }
  }

  // https://github.com/TapWithUs/tap-python-sdk/blob/bf1372a12daee7b1977366484cc10650eb965b7a/tapsdk/backends/macos/TapSDK.py#L139
  refreshInputMode() {
    this.inputMode = this.inputMode;
  }

  get isRunning() {
    return !isNaN(this.intervalId);
  }
  start() {
    if (this.isConnected) {
      this.writeInputMode(this.inputMode);
      if (!this.isRunning) {
        this.intervalId = setInterval(
          this.refreshInputMode.bind(this),
          1000 * 10
        );
      }
    }
  }
  stop() {
    if (this.isRunning) {
      delete this.intervalId;
      clearInterval(this.intervalId);
    }
  }

  // https://github.com/TapWithUs/tap-python-sdk/blob/master/tapsdk/parsers.py
  oncharacteristicvaluechanged(event) {
    const data = event.target.value;

    switch (event.target) {
      // https://github.com/TapWithUs/tap-python-sdk/blob/bf1372a12daee7b1977366484cc10650eb965b7a/tapsdk/backends/macos/TapSDK.py#L92
      // https://github.com/TapWithUs/tap-python-sdk/blob/bf1372a12daee7b1977366484cc10650eb965b7a/tapsdk/parsers.py#L1
      case this.services.data.characteristics.tapData.characteristic:
        console.log("Tap Data");
        const tapDataBitMask = data.getUint8(0);
        const tapData = {};
        TapStrap.TapDataEnumeration.forEach((name, index) => {
          const didTap = tapDataBitMask & (1 << index);
          tapData[name] = didTap;
        });
        const timeInterval = data.getUint16(1, true);

        if (this.mouseMode == "AIR_MOUSE") {
          // FILL
        } else {
          this.dispatchEvent({
            type: "tapdata",
            message: { tapData, tapDataBitMask, timeInterval },
          });
        }
        break;

      // https://github.com/TapWithUs/tap-python-sdk/blob/bf1372a12daee7b1977366484cc10650eb965b7a/tapsdk/backends/macos/TapSDK.py#L87
      // https://github.com/TapWithUs/tap-python-sdk/blob/bf1372a12daee7b1977366484cc10650eb965b7a/tapsdk/parsers.py#L4
      case this.services.data.characteristics.mouseData.characteristic:
        const x = data.getInt16(1, true);
        const y = -data.getInt16(3, true);
        const proximation = data.getUint8(9) === 1;
        this.dispatchEvent({
          type: "mouse",
          message: { x, y, proximation },
        });
        break;
      case this.services.data.characteristics.uiCommand.characteristic:
        break;

      // https://github.com/TapWithUs/tap-python-sdk/blob/bf1372a12daee7b1977366484cc10650eb965b7a/tapsdk/backends/macos/TapSDK.py#L106
      case this.services.data.characteristics.airGestureData.characteristic:
        console.log("Air Gesture Data");
        if (data.getUint8(0) == 0x14) {
          console.log(data.getUint8(1));
          this.mouseMode = TapStrap.MouseModeEnumeration[data.getUint8(1)];
          console.log(`mouse mode switched to ${this.mouseMode}`);
          this.dispatchEvent({
            type: "mousemode",
          });
        } else {
          const airGesture = TapStrap.AirGestureEnumeration[data.getUint8(0)];
          console.log(`air gesture ${airGesture}`);
          this.dispatchEvent({
            type: "airgesture",
            message: { airGesture },
          });
        }
        break;

      /*
      case this.services.data.characteristics.unknown1.characteristic:
        console.log("unknown1");
        break;
      case this.services.data.characteristics.unknown2.characteristic:
        console.log("unknown2");
        break;
      case this.services.data.characteristics.unknown3.characteristic:
        console.log("unknown3");
        break;
      case this.services.data.characteristics.unknown4.characteristic:
        console.log("unknown4");
        break;
      case this.services.data.characteristics.unknown5.characteristic:
        console.log("unknown5");
        break;
      */

      case this.services.support.characteristics.tapMode.characteristic:
        console.log("Tap Mode");
        break;
      case this.services.support.characteristics.rawSensors.characteristic:
        let offset = 0;
        const messages = [];
        while (offset < data.byteLength) {
          let timestamp = data.getUint32(offset, true);
          if (timestamp == 0) {
            break;
          } else {
            offset += 4;
            let type;
            let numberOfSamples;
            if (timestamp > 2 ** 31) {
              type = "accelerometer";
              timestamp -= 2 ** 31;
              numberOfSamples = 15;
            } else {
              type = "imu";
              numberOfSamples = 6;
            }
            const payload = [];
            const sensors = [];
            for (
              let payloadIndex = 0, sensorIndex = 0, vectorIndex = 0;
              payloadIndex < numberOfSamples;
              payloadIndex++, vectorIndex = (vectorIndex + 1) % 3
            ) {
              const value = data.getInt16(offset, true);

              payload.push(value);
              offset += 2;

              if (vectorIndex === 0) {
                sensors[sensorIndex] = [];
              }

              let _vectorIndex = vectorIndex;
              let _value = value;
              _value *= -1;

              switch (vectorIndex) {
                case 0:
                  _vectorIndex = 2;
                  break;
                case 1:
                  _vectorIndex = 0;
                  break;
                case 2:
                  _vectorIndex = 1;
                  break;
              }

              sensors[sensorIndex][_vectorIndex] = _value;

              if (vectorIndex === 2) {
                sensorIndex++;
              }
            }
            const message = { type, timestamp, payload, sensors };
            messages.push(message);
            this.dispatchEvent({
              type,
              message,
            });
          }
        }
        this.dispatchEvent({
          type: "raw",
          message: { messages },
        });
        break;

      default:
        break;
    }
  }

  // https://github.com/TapWithUs/tap-python-sdk/blob/master/tapsdk/backends/macos/inputmodes.py#L11
  get sensitivity() {
    return this._sensitivity || [0, 0, 0];
  }
  set sensitivity(sensitivity) {
    if (
      sensitivity instanceof Array &&
      sensitivity.length >= 3 &&
      sensitivity.every((value) => !isNaN(value))
    ) {
      this._rawInputModeCode =
        this._rawInputModeCode ||
        new DataView(TapStrap.InputModes.raw.buffer.slice());

      this._sensitivity = sensitivity.slice(0, 3).map((value, index) => {
        switch (index) {
          case 0:
            value = Math.max(0, Math.min(4, value));
            break;
          case 1:
            value = Math.max(0, Math.min(5, value));
            break;
          case 2:
            value = Math.max(0, Math.min(4, value));
            break;

          default:
            break;
        }

        this._rawInputModeCode.setUint8(4 + index, value);

        return value;
      });
    }
  }

  // https://github.com/TapWithUs/tap-python-sdk/blob/bf1372a12daee7b1977366484cc10650eb965b7a/tapsdk/backends/macos/TapSDK.py#L115
  async vibrate(sequence) {
    sequence = sequence
      .slice(0, 18)
      .map((value) => Math.max(0, Math.min(255, Math.floor(value/10))));
    if (sequence.length % 2 == 0) {
      sequence.pop()
    }
    await this.services.data.characteristics.uiCommand.characteristic.writeValue(
      TapStrap.arrayToDataView([0x0, 0x2, ...sequence])
    );
  }

  async getBatteryLevel() {
    const value = this.services.batteryLevel.characteristics.batteryLevel.readValue()
    return value.getUint8(0);
  }
}

Object.assign(TapStrap, {
  // https://github.com/TapWithUs/tap-python-sdk/blob/master/tapsdk/models/uuids.py
  services: {
    data: {
      uuid: "c3ff0001-1d8b-40fd-a56f-c7bd5d0f3370",
      characteristics: {
        /*
        unknown1: {
          uuid: "c3ff0002-1d8b-40fd-a56f-c7bd5d0f3370"
        },
        unknown2: {
          uuid: "c3ff0003-1d8b-40fd-a56f-c7bd5d0f3370"
        },
        */
        tapData: {
          uuid: "c3ff0005-1d8b-40fd-a56f-c7bd5d0f3370",
        },
        mouseData: {
          uuid: "c3ff0006-1d8b-40fd-a56f-c7bd5d0f3370",
        },
        /*
        unknown3: {
          uuid: "c3ff0007-1d8b-40fd-a56f-c7bd5d0f3370"
        },
        unknown4: {
          uuid: "c3ff0008-1d8b-40fd-a56f-c7bd5d0f3370"
        },
        */
        uiCommand: {
          uuid: "c3ff0009-1d8b-40fd-a56f-c7bd5d0f3370",
        },
        airGestureData: {
          uuid: "c3ff000a-1d8b-40fd-a56f-c7bd5d0f3370",
        },
        /*
        unknown5: {
          uuid: "c3ff000b-1d8b-40fd-a56f-c7bd5d0f3370"
        }
        */
      },
    },
    support: {
      uuid: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
      characteristics: {
        tapMode: {
          uuid: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
        },
        rawSensors: {
          uuid: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
        },
      },
    },

    /*
    battery_service: {
      uuid: "0000180f-0000-1000-8000-00805f9b34fb",
      characteristics: {}
    },
    device_information: {
      uuid: "0000180a-0000-1000-8000-00805f9b34fb",
      characteristics: {}
    },
    firmware_update: {
      uuid: "0000fe59-0000-1000-8000-00805f9b34fb",
      characteristics: {}
    },
    */
  },

  // https://github.com/TapWithUs/tap-python-sdk/blob/master/tapsdk/models/enumerations.py#L3
  AirGestureEnumeration: [
    "NONE",
    "GENERAL",
    "UP_ONE_FINGER",
    "UP_TWO_FINGERS",
    "DOWN_ONE_FINGER",
    "DOWN_TWO_FINGERS",
    "LEFT_ONE_FINGER",
    "LEFT_TWO_FINGERS",
    "RIGHT_ONE_FINGER",
    "RIGHT_TWO_FINGERS",
    "THUMB_FINGER",
    "THUMB_MIDDLE",
  ],

  TapDataEnumeration: ["thumb", "pointer", "middle", "ring", "pinky"],

  // https://github.com/TapWithUs/tap-python-sdk/blob/master/tapsdk/models/enumerations.py#L30
  MouseModeEnumeration: ["STDBY", "AIR_MOUSE", "OPTICAL1", "OPTICAL2"],

  // https://github.com/TapWithUs/tap-python-sdk/blob/master/tapsdk/backends/macos/inputmodes.py#L5
  InputModes: {
    text: TapStrap.arrayToDataView([0x3, 0xc, 0x0, 0x0]),
    controller: TapStrap.arrayToDataView([0x3, 0xc, 0x0, 0x1]),
    controllerText: TapStrap.arrayToDataView([0x3, 0xc, 0x0, 0x3]),
    raw: TapStrap.arrayToDataView([0x3, 0xc, 0x0, 0xa, 0x0, 0x0, 0x0]),
  },
});

Object.assign(TapStrap.prototype, EventDispatcher.prototype);
