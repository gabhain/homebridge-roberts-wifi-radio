# Homebridge Roberts Radio Plugin

A Homebridge plugin to control Roberts Radios (and other UNDOK/FSAPI compatible devices) via the Apple Home app.

This plugin exposes your radio as a **Television** accessory, allowing for power control, volume adjustment, and source switching directly from the Home app or Control Center remote.

## Features

- **Power Control**: Turn the radio on or off.
- **Source Selection**: Switch between Internet Radio, Spotify, DAB, FM, Bluetooth, and more.
- **Volume Control**: Adjust volume and mute status (visible in the accessory settings or via the physical volume buttons in the Remote widget).
- **Remote Control**: Use the Apple TV Remote widget in Control Center to Play/Pause or skip tracks (Next/Previous).
- **Device Info**: Displays model name, firmware version, and IP address.

## Installation

### Via Homebridge UI
Search for `homebridge-roberts-radio` in the **Plugins** tab and click **Install**.

### Via Command Line
```bash
npm install -g homebridge-roberts-radio
```

## Configuration

Add the following to the `platforms` array in your Homebridge `config.json`:

```json
{
  "platform": "RobertsRadioPlatform",
  "name": "Kitchen Radio",
  "ip": "10.0.0.136",
  "pin": "1234"
}
```

### Parameters
- `name`: (Required) The name of the radio as it will appear in the Home app.
- `ip`: (Required) The IP address of your radio.
- `pin`: (Optional) The UNDOK PIN for your radio (default is `1234`).

## Adding to the Home App

Because this plugin uses the **Television** service, it is published as an **External Accessory**. This means it will not appear automatically in the Home app after restarting Homebridge. You must add it manually:

1. Open the **Home app** on your iOS device.
2. Tap the **+** icon and select **Add Accessory**.
3. Tap **More options...** (or "I don't have a code or cannot scan").
4. Select your **Roberts Radio** from the list of nearby accessories.
5. Enter your **Homebridge PIN** (the same one used to add your main Homebridge bridge).

## Supported Modes (Inputs)

The plugin is pre-configured with the following source IDs:

| ID | Mode |
|----|------|
| 0  | Internet Radio |
| 1  | Tidal |
| 2  | Deezer |
| 3  | Amazon Music |
| 4  | Spotify |
| 5  | Local Music |
| 6  | Music Player |
| 7  | DAB |
| 8  | FM Radio |
| 9  | Bluetooth |
| 10 | AUX |

