# Tap Strap Web SDK

_A client-side JavaScript SDK for Tap Strap_

## 📚 Table of Contents

[⚙️ Setting up the SDK](#-setting-up-the-sdk)

[🔓 Setting Input Modes](#-setting-input-modes)

[💥 Setting Sensitivity](#-setting-sensitivity)

[👂 Listening for Events](#-listening-for-events)

[📳 Vibration](#-vibration)

[🔋 Getting Battery Level](#-getting-battery-level)

## ⚙️ Setting up the SDK

0. Make sure you have a Web Bluetooth-enabled device
   - **Chrome for Desktop [PREFERRED]**: enable Web Bluetooth by going to `chrome://flags/#enable-experimental-web-platform-features` and check `Experimental Web Platform features`
   - **iOS**: Use [WebBLE](https://itunes.apple.com/us/app/webble/id1193531073?mt=8) or [Blufy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055) to demo your web apps. Unfortunately iOS is [very negligent](https://github.com/WebBluetoothCG/web-bluetooth/blob/master/implementation-status.md) on various Web API's.

1. Download the [Tap Manager App](https://www.tapwithus.com/apps/) and connect to your Tap Strap. There you can update the firmware to the latest version, and enable "Developer Mode"

2. Save a copy of the [Web SDK](https://tap-strap-web-sdk.glitch.me/TapStrap.js)

3. In your HTML `<head></head>` element, insert the file in a script element, along with [Three.js](https://threejs.org/):

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r118/three.min.js"></script>
<script src="TapStrap.js"></script>
```

This will create global `TapStrap` class

4. Create a `TapStrap` instance:

```javascript
const tapStrap = new TapStrap();
```

5. Connect to the tap strap using the `tapStrap.connect()` method, which returns a `Promise`:

```javascript
tapStrap.connect().then(() => {
  console.log("connected to the tap strap!");
});
```

You can also add an eventlistener for the `"connect"` event:

```javascript
tapStrap.addEventListener("connect", (event) => {
  console.log("triggered the 'connect' event");
});

tapStrap.connect();
```

## 🔓 Setting Input Mode

```javascript
// "raw" dispatches sensor data
tapStrap.inputMode = "raw";

// "controller" and "controllerText" dispatches tap and mouse data
tapStrap.inputMode = "controller";
```

## 💥 Setting Sensitivity

```javascript
tapStrap.sensitivity = [0, 0, 0];
```

## 👂 Listening for Events

```javascript

// Tap Data
tapStrap.addEventListener("tapdata", event => {
  const { message } = event;
  const { tapData, timeInterval } = message;

  // finger names are ["thumb", "pointer", "middle", "ring", "pinky"]
  for (const fingerName in tapData) {
    const didTap = tapData[fingerName];
    console.log(`the ${fingerName} finger ${didTap? "did":"did not"} tap`);
  }
}

// Mouse Data
tapStrap.addEventListener("mouse", event => {
  const { message } = event;
  const { x, y, proximation } = message;
  // proximation is whether the hand is on a surface or in the air (Tap Strap 2 only)
  console.log(`mouse movement: (${x}, ${y}`);
});

// Air Gestures
tapStrap.addEventListener("airgesture", event => {
  const { message } = event;
  const { airGesture } = message;
  console.log("air gesture", airGesture);
});

// Raw Data
tapStrap.addEventListener("raw", event => {
  const { message } = event;
  const { messages } = message;
  messages.forEach(({ type, timestamp, sensors }) => {
    switch (type) {
      case "accelerometer":
        console.log("accelerometer", sensors)
        break;

      // Thumb IMU data (Tap Strap 2 only)
      case "imu":
        const gyroscope = sensors[0];
        const accelerometer = sensors[1];
        console.log("IMU gyroscope", gyroscope);
        console.log("IMU accelerometer", accelerometer);
        break;
    }
  });
});
```

## 📳 Vibration

```javascript
// pass a sequence of (vibration duration, delay) values in milliseconds
tapStrap.vibrate([1000, 300, 200]);
// vibrates for 1s, delays for 300ms, then vibrates for 200ms
```

## 🔋 Getting Battery Level

```javascript
// returns a promise containing the battery level as a value between 0 to 100
tapStrap.getBatteryLevel().then((batteryLevel) => {
  console.log("Battery Level is now", batteryLevel);
});
```
