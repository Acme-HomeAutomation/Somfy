const config = require('yargs')
    .usage('Usage: $0 [options]')
    .describe('v', 'possible values: "error", "warn", "info", "debug"')
    .describe('n', 'instance name. used as mqtt client id and as prefix for connected topic')
    .describe('u', 'mqtt broker url. See https://github.com/mqttjs/MQTT.js#connect-using-a-url')
    .describe('t', 'settings file with accessToken, refreshToken')
    .describe('s', 'siteId')
    .describe('h', 'show help')
    .alias({
        h: 'help',
        n: 'name',
        u: 'url',
        v: 'verbosity',
        t: 'tokens',
        s: 'siteId'
    })
    .default({
        u: 'mqtt://127.0.0.1',
        n: 'somfy',
        v: 'info',
        t: './.settings',
        s: ''
    })
    .required(['s'])
    .version()
    .help('help')
    .argv;

module.exports = config;
