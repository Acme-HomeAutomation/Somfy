const log = require('yalm');
const Mqtt = require('mqtt');
const config = require('./config');
const pkg = require('./package.json');
const fetch = require('node-fetch');
const fs = require('fs');

let deviceRefreshTask;

log.info(pkg.name + ' ' + pkg.version + ' starting');

const { siteId, tokens } = config;
log.info(`load settings from ${tokens}`);
let { accessToken, refreshToken, clientId, clientSecret} = JSON.parse(fs.readFileSync(tokens));
const headers = new fetch.Headers();
headers.append("Authorization", `Bearer ${accessToken}`);
headers.append("Content-Type", "application/json");

function saveTokens(access_token, refresh_token)
{
    accessToken = access_token;
    refreshToken = refresh_token;
    headers.set("Authorization", `Bearer ${accessToken}`);
    fs.writeFileSync(tokens, JSON.stringify({ accessToken, refreshToken, clientId, clientSecret}));
}

log.info('mqtt trying to connect', config.url);

async function exec(url, init = undefined, retry = true)
{
    const response = await fetch(url, init);
    if (response.status === 401 && retry)
    {
        const refreshResponse = await fetch(`https://accounts.somfy.com/oauth/oauth/v2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token&refresh_token=${refreshToken}`)
        if (refreshResponse.ok)
        {
            const {access_token, refresh_token} = await refreshResponse.json();
            saveTokens(access_token, refresh_token);
            return await exec(url, init, false);
        }
    }
    else if (response.ok)
    {
        return await response.json();
    }
    else
    {
        throw new Error(`${response.status} - ${response.statusText}`);
    }
}

async function getDevices(siteId)
{
    try
    {
        log.info(`getting devices status for ${siteId}`)
        const devices = await exec(`https://api.somfy.com/api/v1/site/${siteId}/device`, {headers});
        for(const {id, available, states} of devices.filter(d => d.states?.length || d.capabilities?.length))
        {
            mqtt.publish(`${config.name}/${id}/status/available`, available ? '1' : '0');
            for(const {name, value} of states)
            {
                mqtt.publish(`${config.name}/${id}/status/${name}`, ''+value);
            }
        }

        log.info(`status updated`)
    }
    catch(error)
    {
        log.error(`unable to get devices: ${error}`);
    }
}

const mqtt = Mqtt.connect(config.url, {will: {topic: config.name + '/connected', payload: '0', retain: true}});

mqtt.on('connect', () => 
{
    log.info('mqtt connected', config.url);
    mqtt.publish(config.name + '/connected', '1', {retain: true});

    const topic = `${config.name}/+/set/+`;
    log.info('mqtt subscribe', topic);
    mqtt.subscribe(topic);

    deviceRefreshTask = setInterval(()=> getDevices(siteId), 30 * 60 * 1000);
    getDevices(siteId);
});

mqtt.on('close', () =>
{
    if (deviceRefreshTask)
    {
        clearInterval(deviceRefreshTask);
        deviceRefreshTask = 0;
    }
})

function jsonTryParse(data)
{
    data = String(data);
    try
    {
        return JSON.parse(data);
    }
    catch
    {
        return data;
    }
}

mqtt.on('message', async (topic, payload) =>
{
    payload = jsonTryParse(payload);
    const [deviceId, _, action] = topic.split('/').slice(-3);
    log.info(`message on ${topic}: ${String(payload)} (${deviceId}: ${action}) [${typeof payload}]`);

    let parameters;
    if (payload === '')
    {
        parameters = [];
    }
    else if (payload instanceof Array)
    {
        parameters = payload;
    }
    else if (typeof payload === 'object')
    {
        parameters = [payload];
    }
    else
    {
        parameters = [{name:action, value:payload}];
    }
    const data = {
        name: action,
        parameters
    }

    const url = `https://api.somfy.com/api/v1/device/${deviceId}/exec`;
    log.info('building command %s with payload: %o', url, data);
    try
    {
        log.debug(await exec(url, {method:'POST', body:JSON.stringify(data), headers}));
    }
    catch(error)
    {
        log.error(`unable to execute command: ${error}`);
    }
});