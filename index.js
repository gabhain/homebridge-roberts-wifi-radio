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
      this.setupAccessories();
    });
  }

  setupAccessories() {
    const name = this.config.name || 'Roberts Radio';
    const radioUuid = this.api.hap.uuid.generate('homebridge:roberts-radio:' + this.config.ip);
    const volumeUuid = this.api.hap.uuid.generate('homebridge:roberts-radio:volume:' + this.config.ip);

    const radioAccessory = new this.api.platformAccessory(name, radioUuid);
    const volumeAccessory = new this.api.platformAccessory(name + ' Volume', volumeUuid);

    radioAccessory.category = Categories.AUDIO_RECEIVER;
    volumeAccessory.category = Categories.LIGHTBULB;

    new RobertsRadio(this.log, this.config, radioAccessory, volumeAccessory, this.api);
    
    // Publish both as External Accessories
    this.api.publishExternalAccessories('homebridge-roberts-radio', [radioAccessory, volumeAccessory]);
    
    this.log.info(`Radio "${name}" and Volume Slider published as external accessories. Add them manually in the Home app.`);
  }
}

class RobertsRadio {
  constructor(log, config, radioAccessory, volumeAccessory, api) {
    this.log = log;
    this.config = config;
    this.accessory = radioAccessory;
    this.volumeAccessory = volumeAccessory;
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

    // --- Radio Accessory Info ---
    const informationService = this.accessory.getService(Service.AccessoryInformation);
    informationService
      .setCharacteristic(Characteristic.Manufacturer, 'Roberts')
      .setCharacteristic(Characteristic.Model, 'Radio')
      .setCharacteristic(Characteristic.SerialNumber, this.ip);

    // --- Volume Accessory Info ---
    const volInfoService = this.volumeAccessory.getService(Service.AccessoryInformation);
    volInfoService
      .setCharacteristic(Characteristic.Manufacturer, 'Roberts')
      .setCharacteristic(Characteristic.Model, 'Radio Volume')
      .setCharacteristic(Characteristic.SerialNumber, this.ip + '-vol');

    // --- TV Service (Radio) ---
    const tvService = this.accessory.getService(Service.Television) || this.accessory.addService(Service.Television, name, 'RadioTVService');
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
          case Characteristic.RemoteKey.VOLUME_UP:
            const volUp = await this.getFSAPI('netRemote.sys.audio.volume');
            await this.setFSAPI('netRemote.sys.audio.volume', Math.min(parseInt(volUp || 0) + 1, 32));
            break;
          case Characteristic.RemoteKey.VOLUME_DOWN:
            const volDown = await this.getFSAPI('netRemote.sys.audio.volume');
            await this.setFSAPI('netRemote.sys.audio.volume', Math.max(parseInt(volDown || 0) - 1, 0));
            break;
        }
        callback();
      });

    // --- Television Speaker (for Remote App) ---
    let speakerService = this.accessory.getService(Service.TelevisionSpeaker);
    if (!speakerService) {
      speakerService = this.accessory.addService(Service.TelevisionSpeaker, name + ' Speaker', 'RadioSpeakerService');
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

    tvService.addLinkedService(speakerService);

    // --- Separate Volume Slider (Lightbulb) ---
    let volumeSliderService = this.volumeAccessory.getService(Service.Lightbulb);
    if (!volumeSliderService) {
      volumeSliderService = this.volumeAccessory.addService(Service.Lightbulb, name + ' Volume', 'RadioVolumeSlider');
    }
    
    volumeSliderService.getCharacteristic(Characteristic.On)
      .on('get', async (callback) => {
        const val = await this.getFSAPI('netRemote.sys.audio.mute');
        callback(null, val === '0'); 
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

    // --- Inputs (Linked to TV) ---
    this.modes.forEach((m) => {
      const inputName = m.name;
      const inputId = 'input' + m.id;
      let input = this.accessory.getService(inputId);
      
      if (!input) {
        input = this.accessory.addService(Service.InputSource, inputName, inputId);
      }

      input
        .setCharacteristic(Characteristic.Identifier, m.id)
        .setCharacteristic(Characteristic.ConfiguredName, inputName)
        .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION);

      tvService.addLinkedService(input);
    });
  }
}
