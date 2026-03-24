const axios = require('axios');

let Service, Characteristic, Categories;

module.exports = (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  Categories = homebridge.hap.Categories;
  homebridge.registerPlatform('homebridge-roberts-radio', 'RobertsRadioPlatform', RobertsRadioPlatform);
};

class RobertsRadioPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;

    if (!config || !config.ip) {
      this.log.error('IP address not configured for Roberts Radio.');
      return;
    }

    this.api.on('didFinishLaunching', () => {
      this.setupAccessory();
    });
  }

  setupAccessory() {
    const name = this.config.name || 'Roberts Radio';
    const uuid = this.api.hap.uuid.generate('homebridge:roberts-radio:' + this.config.ip);
    const accessory = new this.api.platformAccessory(name, uuid);

    // Set Category to AUDIO_RECEIVER so it shows up correctly
    accessory.category = Categories.AUDIO_RECEIVER;

    // Pass the name explicitly to avoid config access issues
    new RobertsRadio(this.log, this.config, accessory, this.api);
    
    // Publish as External Accessory
    this.api.publishExternalAccessories('homebridge-roberts-radio', [accessory]);
    this.log.info(`Radio "${name}" published as an external accessory. Add it manually in the Home app using your Homebridge PIN.`);
  }
}

class RobertsRadio {
  constructor(log, config, accessory, api) {
    this.log = log;
    this.config = config;
    this.accessory = accessory;
    this.api = api;
    this.ip = config.ip;
    this.pin = config.pin || '1234';

    this.modes = [
      { id: 0, name: 'Internet Radio' },
      { id: 1, name: 'Tidal' },
      { id: 2, name: 'Deezer' },
      { id: 3, name: 'Amazon Music' },
      { id: 4, name: 'Spotify' },
      { id: 5, name: 'Local Music' },
      { id: 6, name: 'Music Player' },
      { id: 7, name: 'DAB' },
      { id: 8, name: 'FM Radio' },
      { id: 9, name: 'Bluetooth' },
      { id: 10, name: 'AUX' }
    ];

    this.fsapi = axios.create({
      baseURL: `http://${this.ip}/fsapi`,
      timeout: 3000
    });

    this.setupServices();
  }

  async getFSAPI(path) {
    try {
      const resp = await this.fsapi.get(`/GET/${path}?pin=${this.pin}`);
      const match = resp.data.match(/<value>.*>\s*([^<]*)\s*<.*/);
      return match ? match[1].trim() : null;
    } catch (err) {
      return null;
    }
  }

  async setFSAPI(path, value) {
    try {
      await this.fsapi.get(`/SET/${path}?pin=${this.pin}&value=${value}`);
    } catch (err) {
      this.log.error(`SET ${path}=${value} failed: ${err.message}`);
    }
  }

  setupServices() {
    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;
    const name = this.config.name || 'Roberts Radio';

    const informationService = this.accessory.getService(Service.AccessoryInformation);
    informationService
      .setCharacteristic(Characteristic.Manufacturer, 'Roberts')
      .setCharacteristic(Characteristic.Model, 'Radio')
      .setCharacteristic(Characteristic.SerialNumber, this.ip);

    const tvService = this.accessory.addService(Service.Television, name, 'RadioTVService');
    tvService.setCharacteristic(Characteristic.ConfiguredName, name);
    tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    // Power
    tvService.getCharacteristic(Characteristic.Active)
      .on('get', async (callback) => {
        const val = await this.getFSAPI('netRemote.sys.power');
        callback(null, val === '1' ? 1 : 0);
      })
      .on('set', async (val, callback) => {
        await this.setFSAPI('netRemote.sys.power', val ? 1 : 0);
        callback();
      });

    // Active Input
    tvService.getCharacteristic(Characteristic.ActiveIdentifier)
      .on('get', async (callback) => {
        const val = await this.getFSAPI('netRemote.sys.mode');
        callback(null, parseInt(val || 0));
      })
      .on('set', async (val, callback) => {
        await this.setFSAPI('netRemote.sys.mode', val);
        callback();
      });

    // Remote Keys
    tvService.getCharacteristic(Characteristic.RemoteKey)
      .on('set', async (key, callback) => {
        switch (key) {
          case Characteristic.RemoteKey.REWIND:
            await this.setFSAPI('netRemote.nav.action.navigate', '-1');
            break;
          case Characteristic.RemoteKey.FAST_FORWARD:
            await this.setFSAPI('netRemote.nav.action.navigate', '1');
            break;
          case Characteristic.RemoteKey.PLAY_PAUSE:
            const state = await this.getFSAPI('netRemote.nav.state');
            await this.setFSAPI('netRemote.nav.state', state === '1' ? '2' : '1');
            break;
        }
        callback();
      });

    // Volume
    let speakerService = this.accessory.getService(Service.TelevisionSpeaker);
    if (!speakerService) {
      speakerService = this.accessory.addService(Service.TelevisionSpeaker, name + ' Volume Speaker', 'RadioSpeakerService');
    }
    
    speakerService
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);

    speakerService.getCharacteristic(Characteristic.Volume)
      .on('get', async (callback) => {
        const val = await this.getFSAPI('netRemote.sys.audio.volume');
        callback(null, Math.round((parseInt(val || 0) / 32) * 100));
      })
      .on('set', async (val, callback) => {
        const fsVol = Math.round((val / 100) * 32);
        await this.setFSAPI('netRemote.sys.audio.volume', fsVol);
        callback();
      });

    speakerService.getCharacteristic(Characteristic.Mute)
      .on('get', async (callback) => {
        const val = await this.getFSAPI('netRemote.sys.audio.mute');
        callback(null, val === '1' ? true : false);
      })
      .on('set', async (val, callback) => {
        await this.setFSAPI('netRemote.sys.audio.mute', val ? 1 : 0);
        callback();
      });

    speakerService.getCharacteristic(Characteristic.VolumeSelector)
      .on('set', async (val, callback) => {
        const currentVal = await this.getFSAPI('netRemote.sys.audio.volume');
        let newVol = parseInt(currentVal || 0);
        if (val === Characteristic.VolumeSelector.INCREMENT) {
          newVol = Math.min(newVol + 1, 32);
        } else if (val === Characteristic.VolumeSelector.DECREMENT) {
          newVol = Math.max(newVol - 1, 0);
        }
        await this.setFSAPI('netRemote.sys.audio.volume', newVol);
        callback();
      });

    tvService.addLinkedService(speakerService);

    // Additional Volume Slider as a Lightbulb to show up in the Home App
    // We do NOT link this to tvService so it shows up as a separate tile
    let volumeSliderService = this.accessory.getService(Service.Lightbulb);
    if (!volumeSliderService) {
      volumeSliderService = this.accessory.addService(Service.Lightbulb, name + ' Volume Slider', 'RadioVolumeSlider');
    }
    
    volumeSliderService.getCharacteristic(Characteristic.On)
      .on('get', async (callback) => {
        const val = await this.getFSAPI('netRemote.sys.audio.mute');
        callback(null, val === '0'); // If mute is 0, then "On" is true
      })
      .on('set', async (val, callback) => {
        await this.setFSAPI('netRemote.sys.audio.mute', val ? 0 : 1);
        callback();
      });

    volumeSliderService.getCharacteristic(Characteristic.Brightness)
      .on('get', async (callback) => {
        const val = await this.getFSAPI('netRemote.sys.audio.volume');
        callback(null, Math.round((parseInt(val || 0) / 32) * 100));
      })
      .on('set', async (val, callback) => {
        const fsVol = Math.round((val / 100) * 32);
        await this.setFSAPI('netRemote.sys.audio.volume', fsVol);
        callback();
      });

    // Inputs
    this.modes.forEach((m) => {
      const input = this.accessory.addService(Service.InputSource, m.name, 'input' + m.id);
      input
        .setCharacteristic(Characteristic.Identifier, m.id)
        .setCharacteristic(Characteristic.ConfiguredName, m.name)
        .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION);

      tvService.addLinkedService(input);
    });
  }
}
