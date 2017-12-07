var net = require('net');
var events = require('events');
var zmq = require('zeromq');
var sock = zmq.socket('pub');

//Gives us global access to everything we need for each hashing algorithm
require('./algoProperties.js');

var pool = require('./pool.js');

exports.daemon = require('./daemon.js');
exports.varDiff = require('./varDiff.js');


var createPool = function (poolOptions, authorizeFn) {
    var newPool = new pool(poolOptions, authorizeFn);
    return newPool;
};

var config = {
    "enabled": false,
    "coin": {
        "name": "Dash",
        "symbol": "DASH",
        "algorithm": "x11",
        "mposDiffMultiplier": 256
    },

    "address": "yi7C5qaGrRnvpZ5dzdTynA1kuQ9THQC7o4",

    "blockRefreshInterval": 1000, //How often to poll RPC daemons for new blocks, in milliseconds

    /* Some miner apps will consider the pool dead/offline if it doesn't receive anything new jobs
    for around a minute, so every time we broadcast jobs, set a timeout to rebroadcast
    in this many seconds unless we find a new job. Set to zero or remove to disable this. */
    "jobRebroadcastTimeout": 55,

    /* Some attackers will create thousands of workers that use up all available socket connections,
       usually the workers are zombies and don't submit shares after connecting. This features
       detects those and disconnects them. */
    "connectionTimeout": 600, //Remove workers that haven't been in contact for this many seconds

    /* Sometimes you want the block hashes even for shares that aren't block candidates. */
    "emitInvalidBlockHashes": false,

    /* Enable for client IP addresses to be detected when using a load balancer with TCP proxy
       protocol enabled, such as HAProxy with 'send-proxy' param:
       http://haproxy.1wt.eu/download/1.5/doc/configuration.txt */
    "tcpProxyProtocol": false,

    /* If a worker is submitting a high threshold of invalid shares we can temporarily ban their IP
       to reduce system/network load. Also useful to fight against flooding attacks. If running
       behind something like HAProxy be sure to enable 'tcpProxyProtocol', otherwise you'll end up
       banning your own IP address (and therefore all workers). */
    "banning": {
        "enabled": true,
        "time": 600, //How many seconds to ban worker for
        "invalidPercent": 50, //What percent of invalid shares triggers ban
        "checkThreshold": 500, //Check invalid percent when this many shares have been submitted
        "purgeInterval": 300 //Every this many seconds clear out the list of old bans
    },

    "ports": {
        "3008": {
            "diff": 0.01
        },
    },

    "daemons": [
        {
            "host": "127.0.0.1",
            "port": 17001,
            "user": "user",
            "password": "pass"
        }
    ],

    "publisherSocket": 'tcp://127.0.0.1:12345',
    "publisherTopic": 'dash1',

    "p2p": {
        "enabled": false,
        "host": "127.0.0.1",
        "port": 19333,
        "disableTransactions": true
    },

    "mposMode": {
        "enabled": false,
        "host": "127.0.0.1",
        "port": 3306,
        "user": "me",
        "password": "mypass",
        "database": "ltc",
        "checkPassword": true,
        "autoCreateWorker": false
    }
};

sock.bindSync(config.publisherSocket);
console.log('Connected to ZMQ socket ' + config.publisherSocket);

var pool = createPool(config, function (ip, port, workerName, password, callback) { //stratum authorization function
    console.log("Authorize " + workerName + ":" + password + "@" + ip);
    callback({
        error: null,
        authorized: true,
        disconnect: false
    });
});

pool.on('share', function (isValidShare, isValidBlock, data) {
    if (isValidBlock)
        console.log('Block found');
    else if (isValidShare)
        console.log('Valid share submitted');
    else if (data.blockHash)
        console.log('We thought a block was found but it was rejected by the daemon');
    else
        console.log('Invalid share submitted')

    console.log('share data: ' + JSON.stringify(data));

    if(isValidShare) {
        var minerWorker = data.worker.split(".");

        // transform it
        var share = {
            difficulty: data.difficulty,
            networkDifficulty: data.blockDiff,
            blockHeight: data.height,
            blockReward: data.blockReward / 100000000,
            miner: minerWorker[0],
            worker: minerWorker[1],
            ipAddress: data.ip,
            isBlockCandidate: isValidBlock,
            blockHex: data.blockHex,
            blockHash: data.blockHash,
            transactionConfirmationData: data.txHash,
            userAgent: '',
            payoutInfo: '' // monero only
        };

        // publish
        sock.send([config.publisherTopic, JSON.stringify(share)]);
    }
});

pool.on('log', function (severity, logText) {
    console.log(severity + ': ' + logText);
});

pool.start();
